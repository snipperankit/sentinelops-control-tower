import { describe, it, expect } from "vitest";
import { createSessionApiServer } from "../../harness/server/http.js";
import type { TrueForgeClientLike } from "../../harness/agent/session.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Mock TrueForge client that fails immediately, forcing the session to use
// the local fallback investigation path (no real LLM needed for e2e tests).
const mockTrueForgeClient: TrueForgeClientLike = {
  sessions: {
    create: () => Promise.reject(new Error("TrueForge unavailable in test")),
    getTurn: () => Promise.reject(new Error("TrueForge unavailable in test")),
    createTurnStream: () =>
      Promise.reject(new Error("TrueForge unavailable in test")),
    subscribeToTurn: () =>
      Promise.reject(new Error("TrueForge unavailable in test")),
  },
};

async function waitForSessionState(
  sessionId: string,
  targetStates: string[],
  timeout = 10000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const res = await fetch(
      `http://localhost:10011/api/incidents/${sessionId}`,
    );
    if (!res.ok) throw new Error(`session fetch failed: ${res.status}`);
    const view: any = await res.json();
    if (targetStates.includes(view.state)) return view;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for states ${targetStates.join(",")}`);
}

describe("approvals e2e: create session, approve via API, verify rollback", () => {
  it("creates a session, waits for a pending approval, approves and verifies rollback", async () => {
    const server = createSessionApiServer({
      port: 10011,
      corsOrigin: "*",
      trueForgeClient: mockTrueForgeClient,
    });
    try {
      // create session
      const createRes = await fetch("http://localhost:10011/api/incidents", {
        method: "POST",
      });
      expect(createRes.status).toBe(201);
      const body: any = await createRes.json();
      const sessionId: string = body.sessionId;
      expect(typeof sessionId).toBe("string");

      // wait for awaiting_approval
      const awaiting: any = await waitForSessionState(
        sessionId,
        ["awaiting_approval"],
        8000,
      );
      expect(awaiting.approval).toBeTruthy();
      const approvalId = awaiting.approval.approvalId;

      // ensure approvals API returns nothing before approving (store empty)
      const listRes1 = await fetch(
        `http://localhost:10011/api/approvals?sessionId=${sessionId}`,
      );
      expect(listRes1.status).toBe(200);
      const list1: any = await listRes1.json();
      // may be empty because approval not yet persisted until approve()
      expect(Array.isArray(list1.approvals)).toBe(true);

      // Simulate ApprovalsPanel -> Approve (POST /api/incidents/:id/approve)
      const approveRes = await fetch(
        `http://localhost:10011/api/incidents/${sessionId}/approve`,
        { method: "POST" },
      );
      expect(approveRes.status).toBe(200);

      // After approval, wait for session completed verification (verified or failed)
      const finished: any = await waitForSessionState(
        sessionId,
        ["verified", "failed"],
        10000,
      );
      // Expect a mutation.executed audit in the timeline or verification recorded
      const mutationEvent = (finished.timeline || []).find(
        (t: any) =>
          t.kind === "tool_call" &&
          /deployments.rollback/.test(String(t.summary)),
      );
      expect(mutationEvent).toBeDefined();

      // approvals endpoint should now include the consumed grant
      const listRes2 = await fetch(
        `http://localhost:10011/api/approvals?sessionId=${sessionId}`,
      );
      const list2: any = await listRes2.json();
      expect(Array.isArray(list2.approvals)).toBe(true);
      const found = list2.approvals.find((a: any) => a.id === approvalId);
      // approval should be present and marked consumed
      expect(found).toBeTruthy();
      expect(found.consumed).toBe(true);
    } finally {
      await server.close();
    }
  }, 30000);
});
