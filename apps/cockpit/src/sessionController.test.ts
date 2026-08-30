import { describe, expect, it } from "vitest";
import { ScriptedIncidentController } from "./sessionController.js";

describe("ScriptedIncidentController: full incident flow", () => {
  it("walks investigation -> approval -> rejection -> resume -> approval -> execution -> verification", () => {
    const controller = new ScriptedIncidentController(
      () => new Date("2026-08-24T09:00:00.000Z"),
    );

    expect(controller.getState().state).toBe("investigating");

    controller.advance();
    expect(controller.getState().state).toBe("analyzing");
    expect(controller.getState().evidence.length).toBeGreaterThan(0);

    controller.advance();
    expect(controller.getState().state).toBe("awaiting_approval");
    expect(controller.getState().approval?.status).toBe("pending");

    // Auto-advance must not skip past a pending human decision.
    expect(controller.canAutoAdvance()).toBe(false);

    controller.reject("needs more confirmation");
    expect(controller.getState().state).toBe("rejected");
    expect(controller.getState().approval?.status).toBe("rejected");

    controller.resume();
    expect(controller.getState().state).toBe("analyzing");
    expect(controller.getState().evidence.length).toBeGreaterThan(4);

    controller.advance();
    expect(controller.getState().state).toBe("awaiting_approval");
    const secondApproval = controller.getState().approval;
    expect(secondApproval?.approvalId).toBe("approval-round-2");
    expect(secondApproval?.status).toBe("pending");

    controller.approve();
    expect(controller.getState().state).toBe("approved");
    expect(controller.getState().approval?.status).toBe("consumed");

    controller.advance();
    expect(controller.getState().state).toBe("executing");

    controller.advance();
    expect(controller.getState().state).toBe("verifying");
    expect(controller.getState().verification?.status).toBe("pending");

    controller.advance();
    expect(controller.getState().state).toBe("verified");
    expect(controller.getState().verification?.status).toBe("passed");

    // Terminal: no further auto-advance is possible.
    expect(controller.canAutoAdvance()).toBe(false);
  });

  it("rejects approve() when the session is not awaiting approval", () => {
    const controller = new ScriptedIncidentController(
      () => new Date("2026-08-24T09:00:00.000Z"),
    );
    expect(() => controller.approve()).toThrow(/approval blocked/);
  });

  it("rejects resume() unless the session was rejected", () => {
    const controller = new ScriptedIncidentController(
      () => new Date("2026-08-24T09:00:00.000Z"),
    );
    expect(() => controller.resume()).toThrow(/cannot resume/);
  });

  it("notifies subscribers on every state transition", () => {
    const controller = new ScriptedIncidentController(
      () => new Date("2026-08-24T09:00:00.000Z"),
    );
    const seen: string[] = [];
    const unsubscribe = controller.subscribe((view) => seen.push(view.state));

    controller.advance();
    controller.advance();
    unsubscribe();
    controller.reject("x");

    expect(seen).toEqual(["analyzing", "awaiting_approval"]);
  });

  it("emergency-stops from any non-terminal state without calling a mutation tool", () => {
    const controller = new ScriptedIncidentController(
      () => new Date("2026-08-24T09:00:00.000Z"),
    );
    controller.advance();
    controller.emergencyStop();
    expect(controller.getState().state).toBe("stopped");
    expect(controller.canAutoAdvance()).toBe(false);
  });

  it("is a no-op to emergency-stop an already-terminal session", () => {
    const controller = new ScriptedIncidentController(
      () => new Date("2026-08-24T09:00:00.000Z"),
    );
    controller.emergencyStop();
    const auditLength = controller.getState().auditTrail.length;
    controller.emergencyStop();
    expect(controller.getState().auditTrail.length).toBe(auditLength);
  });
});
