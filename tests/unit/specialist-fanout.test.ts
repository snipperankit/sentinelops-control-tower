// Unit tests for runSpecialistFanOut (harness/server/specialist-fanout.ts):
// real, bounded, concurrent delegation to the observability and deployment
// specialists, merged via aggregateSpecialistFindings, with per-specialist
// fallback when a TrueForge turn fails or a delegated specialist is
// rejected (never silently dropping the other specialist's result).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { FixedClock } from "../../harness/demo/clock.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import { InMemorySessionEventStore } from "../../harness/agent/events.js";
import type {
  TrueForgeClientLike,
  TurnEventStream,
} from "../../harness/agent/session.js";
import { runSpecialistFanOut } from "../../harness/server/specialist-fanout.js";

const FIXED_NOW = new Date("2026-01-01T01:00:00.000Z");
const WINDOW = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-01T02:00:00.000Z",
} as const;

function createStore(): { store: DemoWorldStore; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-fanout-"));
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock: new FixedClock(FIXED_NOW),
  });
  store.reset();
  store.seed();
  return { store, tempDir };
}

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

function turnCreatedEvent(turnId: string): TrueForgeApi.TurnCreatedEvent {
  return {
    type: "turn.created",
    id: "evt_created",
    createdAt: "2026-01-01T00:00:00.000Z",
    previousTurnId: null,
    threadId: null,
    turnId,
    state: { status: "running" },
  } as unknown as TrueForgeApi.TurnCreatedEvent;
}

function turnDoneEvent(output: unknown): TrueForgeApi.TurnDoneEvent {
  return {
    type: "turn.done",
    id: "evt_done",
    createdAt: "2026-01-01T00:00:02.000Z",
    threadId: null,
    state: {
      status: "done",
      completedAt: "2026-01-01T00:00:02.000Z",
      output: [{ type: "text", text: JSON.stringify(output) }],
      requiredActions: [],
    },
  } as unknown as TrueForgeApi.TurnDoneEvent;
}

/** Fake client that returns a distinct structured output per specialist, keyed by the inline spec's skill name. */
function fakeClientWithOutputs(
  outputsBySkill: Record<string, unknown>,
): TrueForgeClientLike {
  let counter = 0;
  const skillBySession = new Map<string, string>();
  return {
    sessions: {
      create: async (request) => {
        const agent = request.agent as { spec?: TrueForgeApi.AgentSpec };
        const skill = agent.spec?.skills?.[0]?.name ?? "unknown";
        counter += 1;
        const id = `session_${counter}`;
        skillBySession.set(id, skill);
        return {
          data: {
            id,
            agent: request.agent,
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: "test",
            title: null,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        } as unknown as TrueForgeApi.GetSessionResponse;
      },
      getTurn: async () => {
        throw new Error("not used in this test");
      },
      createTurnStream: async (sessionId) => {
        const skill = skillBySession.get(sessionId);
        if (skill === undefined || !(skill in outputsBySkill)) {
          throw new Error(`no fake output configured for skill "${skill}"`);
        }
        return streamOf([
          { data: turnCreatedEvent(`turn_${sessionId}`), id: "1" },
          { data: turnDoneEvent(outputsBySkill[skill]), id: "2" },
        ]);
      },
      subscribeToTurn: async () => {
        throw new Error("not used in this test");
      },
    },
  };
}

function alwaysThrowsClient(): TrueForgeClientLike {
  return {
    sessions: {
      create: async () => {
        throw new Error("TrueForge unreachable");
      },
      getTurn: async () => {
        throw new Error("not used in this test");
      },
      createTurnStream: async () => {
        throw new Error("not used in this test");
      },
      subscribeToTurn: async () => {
        throw new Error("not used in this test");
      },
    },
  };
}

describe("runSpecialistFanOut", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("delegates to both specialists concurrently and merges their real findings, preserving disagreement", async () => {
    const { store, tempDir: dir } = createStore();
    tempDir = dir;
    const world = store.load();

    const client = fakeClientWithOutputs({
      "observability-analysis": {
        summary: "Error rate and latency are both elevated.",
        toolsUsed: [
          "observability.get_error_rates",
          "observability.get_latency",
        ],
        verdict: "supports_mutation",
        reason: "Clear anomaly in both signals.",
        anomalyDetected: true,
        metrics: [],
      },
      "deployment-analysis": {
        summary: "No deployment correlates with the incident onset.",
        toolsUsed: ["deployments.get_diff"],
        verdict: "against_mutation",
        reason: "Diff shows no plausible causal mechanism.",
        suspectDeploymentId: null,
        correlatedWithIncidentOnset: false,
      },
    });

    const result = await runSpecialistFanOut({
      trueForgeClient: client,
      eventStore: new InMemorySessionEventStore(),
      model: "test-model",
      connectorNames: {
        observability: "observability",
        deployments: "deployments",
      },
      environment: world.environment,
      service: "checkout",
      activeDeploymentId: world.activeDeploymentId,
      window: WINDOW,
      store,
      clock: new FixedClock(FIXED_NOW),
    });

    expect(result.observability.verdict).toBe("supports_mutation");
    expect(result.deployment.verdict).toBe("against_mutation");
    expect(result.report.specialistFindings).toHaveLength(2);
    expect(result.report.hasDisagreement).toBe(true);
    expect(result.report.disagreements).toHaveLength(1);
    expect(result.report.disagreements[0]?.specialists).toEqual([
      "observability-investigator",
      "deployment-investigator",
    ]);
  });

  it("falls back to deterministic, tool-grounded findings for both specialists when TrueForge is unreachable", async () => {
    const { store, tempDir: dir } = createStore();
    tempDir = dir;
    const world = store.load();
    const notes: string[] = [];

    const result = await runSpecialistFanOut({
      trueForgeClient: alwaysThrowsClient(),
      eventStore: new InMemorySessionEventStore(),
      model: "test-model",
      connectorNames: {
        observability: "observability",
        deployments: "deployments",
      },
      environment: world.environment,
      service: "checkout",
      activeDeploymentId: world.activeDeploymentId,
      window: WINDOW,
      store,
      clock: new FixedClock(FIXED_NOW),
      onNote: (note) => notes.push(note),
    });

    expect(result.observability.toolsUsed).toContain(
      "observability.get_error_rates",
    );
    expect(result.deployment.toolsUsed).toContain("deployments.get_diff");
    expect(result.report.specialistFindings).toHaveLength(2);
    expect(notes.some((n) => n.includes("fallback"))).toBe(true);
  });
});
