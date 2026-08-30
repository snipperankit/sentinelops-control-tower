// Real-flow tests for LiveIncidentSession: exercises the actual MCP tool
// contracts, the real Docker sandbox, the real policy gateway, the real
// rollback mutation, and the real post-rollback verification against a
// temporary, isolated demo world (see .github/instructions/tests.instructions.md).
// No step here is scripted or narrated — every assertion reflects a real
// computed outcome.
//
// A mock TrueForgeClient that always rejects is injected (same pattern as
// tests/mcp/approvals.e2e.test.ts) so this suite deterministically exercises
// LiveIncidentSession's real, in-process MCP-tool-based fallback investigation
// path instead of a live LLM call. This keeps the suite independent of model
// provider availability/quota (avoid flaky tests based on wall-clock/network
// dependent external calls; see .github/instructions/tests.instructions.md).
// Real-LLM-backed investigation is covered separately by the eval harness
// (see evals/), which is the appropriate place to assert model behavior.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import {
  LiveIncidentSession,
  InvalidSessionTransitionError,
} from "../../harness/server/incident-session.js";
import type { SessionViewModelWire } from "../../harness/server/contract.js";
import type { TrueForgeClientLike } from "../../harness/agent/session.js";

const NOW = new Date("2026-01-01T02:00:00.000Z");
const tempDirs: string[] = [];

// Forces LiveIncidentSession's local, no-LLM fallback investigation path
// (see harness/server/incident-session.ts's runLocalInvestigation) on every
// call, rather than depending on a live TrueForge server or model quota.
const unavailableTrueForgeClient: TrueForgeClientLike = {
  sessions: {
    create: () => Promise.reject(new Error("TrueForge unavailable in test")),
    getTurn: () => Promise.reject(new Error("TrueForge unavailable in test")),
    createTurnStream: () =>
      Promise.reject(new Error("TrueForge unavailable in test")),
    subscribeToTurn: () =>
      Promise.reject(new Error("TrueForge unavailable in test")),
  },
};

function createSession(): LiveIncidentSession {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-live-session-"));
  tempDirs.push(tempDir);
  const clock = new FixedClock(NOW);
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock,
  });
  return LiveIncidentSession.create({
    store,
    clock,
    trueForgeClient: unavailableTrueForgeClient,
  });
}

/** Waits until the session's view model reaches one of the target states, or the timeout elapses. */
function waitForState(
  session: LiveIncidentSession,
  targetStates: readonly SessionViewModelWire["state"][],
  timeoutMs = 15_000,
): Promise<SessionViewModelWire> {
  const initial = session.getViewModel();
  if (targetStates.includes(initial.state)) {
    return Promise.resolve(initial);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Timed out waiting for state in [${targetStates.join(", ")}]; last state was "${session.getViewModel().state}"`,
        ),
      );
    }, timeoutMs);
    const unsubscribe = session.subscribe((view) => {
      if (targetStates.includes(view.state)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(view);
      }
    });
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("LiveIncidentSession: real investigation flow", () => {
  it("gathers real evidence and hypotheses and reaches a pending approval for a real rollback", async () => {
    const session = createSession();
    const view = await waitForState(session, ["awaiting_approval", "failed"]);

    expect(view.state).toBe("awaiting_approval");
    expect(view.evidence.length).toBeGreaterThan(0);
    expect(
      view.evidence.some((e) => e.sourceTool === "deployments.list_recent"),
    ).toBe(true);
    expect(
      view.evidence.some(
        (e) =>
          e.sourceTool === "incidents.get_runbook" && e.trust === "untrusted",
      ),
    ).toBe(true);
    expect(view.hypotheses.length).toBeGreaterThan(0);
    expect(view.hypotheses.some((h) => h.ruledOut)).toBe(true);
    expect(view.approval).not.toBeNull();
    expect(view.approval?.status).toBe("pending");
    expect(view.approval?.toolName).toBe("deployments.rollback");
    expect(["idle", "running", "completed", "blocked", "error"]).toContain(
      view.sandbox.status,
    );
    expect(view.specialistFindings.length).toBeGreaterThan(0);
    expect(view.auditTrail.length).toBeGreaterThan(0);
  }, 20_000);

  it("approve() authorizes and executes the real rollback, then reaches real verification", async () => {
    const session = createSession();
    await waitForState(session, ["awaiting_approval", "failed"]);

    session.approve();
    const view = await waitForState(session, ["verified", "failed"]);

    expect(view.state).toBe("verified");
    expect(view.approval?.status).toBe("consumed");
    expect(view.verification).not.toBeNull();
    expect(view.verification?.status).toBe("passed");
    expect(view.verification?.signals.length).toBeGreaterThan(0);
    expect(
      view.auditTrail.some((entry) => entry.type === "mutation.executed"),
    ).toBe(true);
    expect(
      view.timeline.some(
        (entry) =>
          entry.kind === "tool_call" &&
          entry.toolName === "deployments.rollback",
      ),
    ).toBe(true);
  }, 20_000);

  it("reject() then resume() runs a second real investigation round before approval", async () => {
    const session = createSession();
    await waitForState(session, ["awaiting_approval", "failed"]);

    session.reject("needs a second look");
    const rejectedView = session.getViewModel();
    expect(rejectedView.state).toBe("rejected");
    expect(rejectedView.approval?.status).toBe("rejected");

    session.resume();
    const view = await waitForState(session, ["awaiting_approval", "failed"]);

    expect(view.state).toBe("awaiting_approval");
    expect(view.approval?.status).toBe("pending");
    expect(
      view.timeline.filter((entry) => entry.kind === "approval_requested")
        .length,
    ).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("rejects approve() when the session is not awaiting approval", () => {
    const session = createSession();
    expect(() => session.approve()).toThrow(InvalidSessionTransitionError);
  });

  it("emergencyStop() halts the session and never allows a further mutation", async () => {
    const session = createSession();
    await waitForState(session, ["awaiting_approval", "failed"]);

    session.emergencyStop();
    const view = session.getViewModel();
    expect(view.state).toBe("stopped");

    expect(() => session.approve()).toThrow(InvalidSessionTransitionError);
  }, 20_000);
});
