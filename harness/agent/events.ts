// Injectable event-store abstraction for persisted TrueForge turn events.
// Kept independent of any specific storage backend (in-memory here; a
// future durable store — e.g. SQLite — can implement the same interface)
// so harness/agent/session.ts never depends on storage details.
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import type { Clock } from "../demo/clock.js";
import { SystemClock } from "../demo/clock.js";

/**
 * A single persisted turn event. `sequenceId` is the SSE resume cursor
 * (the `id` field from `stream.withMetadata()`, a numeric string) — it is
 * distinct from `event.id`, which is the event's own monotonic ULID.
 * `sequenceId` is undefined for events replayed from `listTurnEvents` or
 * any source that does not carry a resume cursor.
 */
export interface StoredSessionEvent {
  readonly sessionId: string;
  readonly turnId: string;
  readonly sequenceId?: string;
  readonly event: TrueForgeApi.TurnStreamingEvent;
  /** Tool-call provenance envelope, extracted from `tool.response` events whose `content` is our MCP tools' JSON output (see mcp provenance.ts files). Undefined for every other event type. */
  readonly toolProvenance?: unknown;
  readonly recordedAt: string;
}

export interface SessionEventStore {
  append(event: Omit<StoredSessionEvent, "recordedAt">): void;
  listForTurn(sessionId: string, turnId: string): readonly StoredSessionEvent[];
  /** Highest `sequenceId` seen for a turn, for resume via `subscribeToTurn({ afterSequenceNumber })`. */
  lastSequenceIdForTurn(sessionId: string, turnId: string): string | undefined;
}

export class InMemorySessionEventStore implements SessionEventStore {
  private readonly eventsByTurn = new Map<string, StoredSessionEvent[]>();
  private readonly clock: Clock;

  constructor(clock: Clock = new SystemClock()) {
    this.clock = clock;
  }

  private key(sessionId: string, turnId: string): string {
    return `${sessionId}:${turnId}`;
  }

  append(event: Omit<StoredSessionEvent, "recordedAt">): void {
    const key = this.key(event.sessionId, event.turnId);
    const existing = this.eventsByTurn.get(key) ?? [];
    existing.push({ ...event, recordedAt: this.clock.now().toISOString() });
    this.eventsByTurn.set(key, existing);
  }

  listForTurn(
    sessionId: string,
    turnId: string,
  ): readonly StoredSessionEvent[] {
    return this.eventsByTurn.get(this.key(sessionId, turnId)) ?? [];
  }

  lastSequenceIdForTurn(sessionId: string, turnId: string): string | undefined {
    const events = this.listForTurn(sessionId, turnId);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const sequenceId = events[i]?.sequenceId;
      if (sequenceId !== undefined) {
        return sequenceId;
      }
    }
    return undefined;
  }
}

/**
 * Extracts the `.provenance` field from a `tool.response` event's JSON
 * `content`, if present. Every MCP tool in this repo always includes a
 * `provenance` envelope in its structured output (see mcp provenance.ts files);
 * this preserves it end to end into the session event store. Returns
 * undefined for non-JSON or provenance-less content rather than throwing —
 * tool content is untrusted, external data (see SECURITY.md).
 */
export function extractToolProvenance(
  event: TrueForgeApi.TurnStreamingEvent,
): unknown | undefined {
  if (event.type !== "tool.response") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(event.content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "provenance" in parsed
    ) {
      return (parsed as { provenance: unknown }).provenance;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
