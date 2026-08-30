// Unit tests for LiveSessionClient: mocks fetch + EventSource so the wiring
// between the cockpit and a real session server can be validated without a
// running harness/server process. See harness/server/README.md for the
// server side of this contract.
import { describe, expect, it, vi } from "vitest";
import {
  LiveSessionClient,
  LiveSessionConnectionError,
  type EventSourceLike,
} from "./liveSessionClient.js";
import type { SessionViewModel } from "./types.js";

const VALID_VIEW: SessionViewModel = {
  incident: {
    id: "incident-1",
    title: "Payment failures elevated",
    severity: "high",
    openedAt: "2026-01-01T00:00:00.000Z",
  },
  state: "investigating",
  policyAvailable: true,
  timeline: [],
  evidence: [],
  hypotheses: [],
  confidence: { confidencePercent: 10, uncertaintyFactors: [] },
  specialistFindings: [],
  sandbox: {
    status: "idle",
    network: "disabled",
    filesystem: "workspace-only",
  },
  approval: null,
  verification: null,
  auditTrail: [],
};

function fakeEventSource(): EventSourceLike & {
  emit(view: SessionViewModel): void;
} {
  const target: EventSourceLike & { emit(view: SessionViewModel): void } = {
    onmessage: null,
    onerror: null,
    close: vi.fn(),
    emit(view: SessionViewModel) {
      target.onmessage?.({ data: JSON.stringify(view) });
    },
  };
  return target;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("LiveSessionClient", () => {
  it("creates a session, fetches the initial snapshot, and connects to the stream", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "session-1" }))
      .mockResolvedValueOnce(jsonResponse(VALID_VIEW));
    const source = fakeEventSource();
    const createEventSource = vi.fn().mockReturnValue(source);

    const client = await LiveSessionClient.connect({
      baseUrl: "http://localhost:8810",
      fetchImpl,
      createEventSource,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8810/api/incidents",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8810/api/incidents/session-1",
      undefined,
    );
    expect(createEventSource).toHaveBeenCalledWith(
      "http://localhost:8810/api/incidents/session-1/stream",
    );
    expect(client.getState()).toEqual(VALID_VIEW);
  });

  it("notifies subscribers with validated snapshots from the SSE stream", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "session-1" }))
      .mockResolvedValueOnce(jsonResponse(VALID_VIEW));
    const source = fakeEventSource();
    const client = await LiveSessionClient.connect({
      baseUrl: "http://localhost:8810",
      fetchImpl,
      createEventSource: () => source,
    });

    const seen: string[] = [];
    client.subscribe((view) => seen.push(view.state));

    const nextView: SessionViewModel = { ...VALID_VIEW, state: "analyzing" };
    source.emit(nextView);

    expect(seen).toEqual(["analyzing"]);
    expect(client.getState().state).toBe("analyzing");
  });

  it("ignores malformed SSE payloads instead of throwing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "session-1" }))
      .mockResolvedValueOnce(jsonResponse(VALID_VIEW));
    const source = fakeEventSource();
    const client = await LiveSessionClient.connect({
      baseUrl: "http://localhost:8810",
      fetchImpl,
      createEventSource: () => source,
    });

    const seen: string[] = [];
    client.subscribe((view) => seen.push(view.state));

    source.onmessage?.({ data: JSON.stringify({ not: "a valid view model" }) });

    expect(seen).toEqual([]);
    expect(client.getState().state).toBe("investigating");
  });

  it("posts approve/reject/resume/emergency-stop actions to the session API", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sessionId: "session-1" }))
      .mockResolvedValueOnce(jsonResponse(VALID_VIEW))
      .mockResolvedValue(jsonResponse({ ok: true }));
    const client = await LiveSessionClient.connect({
      baseUrl: "http://localhost:8810",
      fetchImpl,
      createEventSource: fakeEventSource,
    });

    client.approve();
    client.reject("not enough evidence");
    client.resume();
    client.emergencyStop();

    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(6);
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "http://localhost:8810/api/incidents/session-1/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "http://localhost:8810/api/incidents/session-1/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "not enough evidence" }),
      }),
    );
  });

  it("throws LiveSessionConnectionError when session creation fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

    await expect(
      LiveSessionClient.connect({
        baseUrl: "http://localhost:8810",
        fetchImpl,
        createEventSource: fakeEventSource,
      }),
    ).rejects.toThrow(LiveSessionConnectionError);
  });
});
