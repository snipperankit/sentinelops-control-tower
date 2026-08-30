import { describe, expect, it } from "vitest";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { InMemorySessionEventStore } from "../../harness/agent/events.js";
import {
  AgentSessionRunner,
  type TrueForgeClientLike,
  type TurnEventStream,
} from "../../harness/agent/session.js";

function streamOf(
  items: ReadonlyArray<{
    readonly data: TrueForgeApi.TurnStreamingEvent;
    readonly id?: string;
  }>,
): TurnEventStream {
  return {
    withMetadata() {
      return (async function* () {
        for (const item of items) {
          yield item;
        }
      })();
    },
  };
}

const TURN_CREATED_EVENT = {
  type: "turn.created",
  id: "evt_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  previousTurnId: null,
  threadId: null,
  turnId: "turn_1",
  state: { status: "running" },
} as unknown as TrueForgeApi.TurnCreatedEvent;

const TOOL_RESPONSE_EVENT = {
  type: "tool.response",
  id: "evt_2",
  createdAt: "2026-01-01T00:00:01.000Z",
  threadId: "thread_1",
  toolCallId: "call_1",
  content: JSON.stringify({
    result: "ok",
    provenance: {
      tool: "observability.get_metrics",
      sourceEnvironment: "staging",
    },
  }),
} as unknown as TrueForgeApi.ToolResponseEvent;

function turnDoneEvent(): TrueForgeApi.TurnDoneEvent {
  return {
    type: "turn.done",
    id: "evt_3",
    createdAt: "2026-01-01T00:00:02.000Z",
    threadId: null,
    state: {
      status: "done",
      completedAt: "2026-01-01T00:00:02.000Z",
      output: null,
      requiredActions: [],
    },
  } as unknown as TrueForgeApi.TurnDoneEvent;
}

describe("AgentSessionRunner.startInvestigation", () => {
  it("streams turn events into the event store, preserving tool provenance, and returns the final turn state", async () => {
    const eventStore = new InMemorySessionEventStore();
    const doneEvent = turnDoneEvent();
    const client: TrueForgeClientLike = {
      sessions: {
        create: async () =>
          ({
            data: {
              id: "session_1",
              agent: { name: "sentinelops-commander" },
              createdAt: "2026-01-01T00:00:00.000Z",
              createdBy: "test",
              title: null,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          }) as unknown as TrueForgeApi.GetSessionResponse,
        getTurn: async () => {
          throw new Error("not used in this test");
        },
        createTurnStream: async () =>
          streamOf([
            { data: TURN_CREATED_EVENT, id: "1" },
            { data: TOOL_RESPONSE_EVENT, id: "2" },
            { data: doneEvent, id: "3" },
          ]),
        subscribeToTurn: async () => {
          throw new Error("not used in this test");
        },
      },
    };

    const runner = new AgentSessionRunner(client, eventStore);
    const handle = await runner.startInvestigation({
      agentName: "sentinelops-commander",
      initialMessage: "Investigate the payment-failures alert.",
    });

    expect(handle.sessionId).toBe("session_1");
    expect(handle.turnId).toBe("turn_1");
    expect(handle.state).toEqual(doneEvent.state);

    const stored = eventStore.listForTurn("session_1", "turn_1");
    expect(stored).toHaveLength(3);
    expect(stored[1]?.toolProvenance).toEqual({
      tool: "observability.get_metrics",
      sourceEnvironment: "staging",
    });
    expect(stored[1]?.sequenceId).toBe("2");
    expect(eventStore.lastSequenceIdForTurn("session_1", "turn_1")).toBe("3");
  });
});

describe("AgentSessionRunner.resumeInvestigation", () => {
  it("returns the terminal state directly without opening a new stream", async () => {
    const eventStore = new InMemorySessionEventStore();
    const doneEvent = turnDoneEvent();
    let subscribeCalled = false;
    const client: TrueForgeClientLike = {
      sessions: {
        create: async () => {
          throw new Error("not used in this test");
        },
        getTurn: async () =>
          ({
            data: {
              id: "turn_1",
              sessionId: "session_1",
              previousTurnId: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              state: doneEvent.state,
            },
          }) as unknown as TrueForgeApi.GetTurnResponse,
        createTurnStream: async () => {
          throw new Error("not used in this test");
        },
        subscribeToTurn: async () => {
          subscribeCalled = true;
          return streamOf([]);
        },
      },
    };

    const runner = new AgentSessionRunner(client, eventStore);
    const handle = await runner.resumeInvestigation("session_1", "turn_1");

    expect(subscribeCalled).toBe(false);
    expect(handle.state).toEqual(doneEvent.state);
  });

  it("resumes a running turn from the last recorded sequence id", async () => {
    const eventStore = new InMemorySessionEventStore();
    eventStore.append({
      sessionId: "session_1",
      turnId: "turn_1",
      sequenceId: "7",
      event: TURN_CREATED_EVENT,
    });

    let receivedAfterSequenceNumber: number | null | undefined;
    const doneEvent = turnDoneEvent();
    const client: TrueForgeClientLike = {
      sessions: {
        create: async () => {
          throw new Error("not used in this test");
        },
        getTurn: async () =>
          ({
            data: {
              id: "turn_1",
              sessionId: "session_1",
              previousTurnId: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              state: { status: "running" },
            },
          }) as unknown as TrueForgeApi.GetTurnResponse,
        createTurnStream: async () => {
          throw new Error("not used in this test");
        },
        subscribeToTurn: async (_sessionId, _turnId, request) => {
          receivedAfterSequenceNumber = request?.afterSequenceNumber;
          return streamOf([{ data: doneEvent, id: "8" }]);
        },
      },
    };

    const runner = new AgentSessionRunner(client, eventStore);
    const handle = await runner.resumeInvestigation("session_1", "turn_1");

    expect(receivedAfterSequenceNumber).toBe(7);
    expect(handle.state).toEqual(doneEvent.state);
    expect(eventStore.lastSequenceIdForTurn("session_1", "turn_1")).toBe("8");
  });
});
