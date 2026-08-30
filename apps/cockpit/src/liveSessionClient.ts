// Live session client: connects the cockpit to a real session, served by
// harness/server/http.ts, instead of the scripted demo controller. Every
// incoming payload is untrusted external data until parsed (see AGENTS.md
// "Validate all external input at boundaries") — parseSessionViewModel is
// the only path a server payload can take into rendered state.
import type { IncidentController } from "./controller.js";
import { parseSessionViewModel, type SessionViewModel } from "./types.js";

export class LiveSessionConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveSessionConnectionError";
  }
}

/** Minimal subset of the browser EventSource API this client depends on — kept narrow so tests can supply a fake. */
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export interface LiveSessionClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly createEventSource?: EventSourceFactory;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LiveSessionConnectionError(
      `Request to ${url} failed with ${response.status}: ${body}`,
    );
  }
  return (await response.json()) as unknown;
}

/**
 * Drives a real incident session over HTTP + Server-Sent Events. Implements
 * the same `IncidentController` interface as `ScriptedIncidentController`
 * so `App.tsx` requires no changes to switch between them.
 */
export class LiveSessionClient implements IncidentController {
  private view: SessionViewModel;
  private readonly listeners = new Set<(view: SessionViewModel) => void>();
  private readonly eventSource: EventSourceLike;

  private constructor(
    private readonly baseUrl: string,
    private readonly sessionId: string,
    initialView: SessionViewModel,
    private readonly fetchImpl: typeof fetch,
    eventSource: EventSourceLike,
  ) {
    this.view = initialView;
    this.eventSource = eventSource;
    this.eventSource.onmessage = (event) => {
      let parsed: SessionViewModel;
      try {
        parsed = parseSessionViewModel(JSON.parse(event.data));
      } catch {
        // Malformed/untrusted payload — ignore rather than rendering it.
        return;
      }
      this.view = parsed;
      for (const listener of this.listeners) listener(parsed);
    };
  }

  /** Creates a new incident session on the server and connects to its live stream. */
  static async connect(
    options: LiveSessionClientOptions,
  ): Promise<LiveSessionClient> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const createEventSource =
      options.createEventSource ??
      ((url: string) => new EventSource(url) as unknown as EventSourceLike);

    const created = (await fetchJson(
      fetchImpl,
      `${options.baseUrl}/api/incidents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    )) as { sessionId?: unknown };

    if (
      typeof created.sessionId !== "string" ||
      created.sessionId.length === 0
    ) {
      throw new LiveSessionConnectionError(
        "Session API did not return a valid sessionId",
      );
    }
    const sessionId = created.sessionId;

    const initialRaw = await fetchJson(
      fetchImpl,
      `${options.baseUrl}/api/incidents/${sessionId}`,
    );
    const initialView = parseSessionViewModel(initialRaw);

    const eventSource = createEventSource(
      `${options.baseUrl}/api/incidents/${sessionId}/stream`,
    );

    return new LiveSessionClient(
      options.baseUrl,
      sessionId,
      initialView,
      fetchImpl,
      eventSource,
    );
  }

  /** Rejoin an existing session id instead of creating a new one. */
  static async rejoin(
    options: LiveSessionClientOptions & { readonly sessionId: string },
  ): Promise<LiveSessionClient> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const createEventSource =
      options.createEventSource ??
      ((url: string) => new EventSource(url) as unknown as EventSourceLike);

    const sessionId = options.sessionId;

    const initialRaw = await fetchJson(
      fetchImpl,
      `${options.baseUrl}/api/incidents/${sessionId}`,
    );
    const initialView = parseSessionViewModel(initialRaw);

    const eventSource = createEventSource(
      `${options.baseUrl}/api/incidents/${sessionId}/stream`,
    );

    return new LiveSessionClient(
      options.baseUrl,
      sessionId,
      initialView,
      fetchImpl,
      eventSource,
    );
  }

  getState(): SessionViewModel {
    return this.view;
  }

  subscribe(listener: (view: SessionViewModel) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The server drives its own state transitions; the client never auto-advances. */
  canAutoAdvance(): boolean {
    return false;
  }

  advance(): void {
    // No-op: live sessions are entirely server-driven.
  }

  approve(): void {
    void this.post("approve");
  }

  reject(reason: string): void {
    void this.post("reject", { reason });
  }

  resume(): void {
    void this.post("resume");
  }

  emergencyStop(): void {
    void this.post("emergency-stop");
  }

  close(): void {
    this.eventSource.close();
  }

  private async post(
    action: string,
    body?: Record<string, unknown>,
  ): Promise<void> {
    await fetchJson(
      this.fetchImpl,
      `${this.baseUrl}/api/incidents/${this.sessionId}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      },
    );

    // After performing an action, proactively fetch the latest view so the
    // UI updates immediately even if the EventSource stream misses the
    // corresponding server-sent event (network flakiness / browser issues).
    try {
      const latestRaw = (await fetchJson(
        this.fetchImpl,
        `${this.baseUrl}/api/incidents/${this.sessionId}`,
      )) as unknown;
      const parsed = parseSessionViewModel(latestRaw);
      this.view = parsed;
      for (const listener of this.listeners) listener(parsed);
    } catch {
      // Ignore; SSE should deliver the update eventually.
    }
  }
}
