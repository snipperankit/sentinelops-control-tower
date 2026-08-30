import { describe, expect, it } from "vitest";
import {
  DelegationTracker,
  DelegationCoordinator,
  DelegationDepthExceededError,
  DelegationBudgetExceededError,
  DelegationLoopDetectedError,
  UnauthorizedToolAccessError,
} from "../../harness/agent/delegation.js";
import type { SpecialistName } from "../../harness/agent/specialist-result-schema.js";

interface FakeFindings {
  readonly toolsUsed: readonly string[];
}

describe("DelegationTracker: bounded depth and count", () => {
  it("allows delegation up to the configured depth, then throws", () => {
    const tracker = new DelegationTracker({ maxDepth: 1, maxDelegations: 10 });

    const scope = tracker.beginDelegation("observability-investigator");
    expect(tracker.depth).toBe(1);

    expect(() => tracker.beginDelegation("deployment-investigator")).toThrow(
      DelegationDepthExceededError,
    );

    scope.end();
    expect(tracker.depth).toBe(0);
  });

  it("allows delegation up to the configured total count, then throws", () => {
    const tracker = new DelegationTracker({ maxDepth: 5, maxDelegations: 2 });

    tracker.beginDelegation("observability-investigator").end();
    tracker.beginDelegation("deployment-investigator").end();

    expect(() => tracker.beginDelegation("runbook-investigator")).toThrow(
      DelegationBudgetExceededError,
    );
    expect(tracker.count).toBe(2);
  });

  it("detects a delegation loop: the same specialist already active in the chain", () => {
    const tracker = new DelegationTracker({ maxDepth: 5, maxDelegations: 10 });

    tracker.beginDelegation("observability-investigator");

    expect(() => tracker.beginDelegation("observability-investigator")).toThrow(
      DelegationLoopDetectedError,
    );
  });

  it("end() is idempotent and safe to call more than once", () => {
    const tracker = new DelegationTracker({ maxDepth: 1, maxDelegations: 10 });
    const scope = tracker.beginDelegation("observability-investigator");
    scope.end();
    scope.end();
    expect(tracker.depth).toBe(0);
  });
});

describe("DelegationCoordinator: bounded orchestration + tool-allowlist enforcement", () => {
  it("returns the specialist's findings and releases the tracker slot on success", async () => {
    const tracker = new DelegationTracker();
    const coordinator = new DelegationCoordinator(tracker);

    const result = await coordinator.delegate<FakeFindings>({
      specialist: "observability-investigator",
      allowedTools: ["observability.get_error_rates"],
      run: async () => ({ toolsUsed: ["observability.get_error_rates"] }),
    });

    expect(result.toolsUsed).toEqual(["observability.get_error_rates"]);
    expect(tracker.depth).toBe(0);
    expect(tracker.count).toBe(1);
  });

  it("throws UnauthorizedToolAccessError when a specialist reports using a tool outside its allowlist", async () => {
    const tracker = new DelegationTracker();
    const coordinator = new DelegationCoordinator(tracker);

    await expect(
      coordinator.delegate<FakeFindings>({
        specialist: "deployment-investigator",
        allowedTools: ["deployments.get_health"],
        run: async () => ({ toolsUsed: ["deployments.rollback"] }),
      }),
    ).rejects.toThrow(UnauthorizedToolAccessError);

    // The tracker slot must still be released even on failure.
    expect(tracker.depth).toBe(0);
  });

  it("prevents a delegation loop even when the nested call happens inside `run`", async () => {
    const tracker = new DelegationTracker({ maxDepth: 5, maxDelegations: 10 });
    const coordinator = new DelegationCoordinator(tracker);

    const attemptNestedSelfDelegation = async (): Promise<FakeFindings> => {
      // Simulates a specialist attempting to delegate to itself again while
      // its own delegation is still active — must be rejected, not silently
      // allowed to recurse.
      return coordinator.delegate<FakeFindings>({
        specialist: "observability-investigator",
        allowedTools: [],
        run: async () => ({ toolsUsed: [] }),
      });
    };

    await expect(
      coordinator.delegate<FakeFindings>({
        specialist: "observability-investigator",
        allowedTools: [],
        run: attemptNestedSelfDelegation,
      }),
    ).rejects.toThrow(DelegationLoopDetectedError);

    expect(tracker.depth).toBe(0);
  });

  it("stops delegating once the total budget is exhausted across sequential specialists", async () => {
    const tracker = new DelegationTracker({ maxDepth: 5, maxDelegations: 2 });
    const coordinator = new DelegationCoordinator(tracker);
    const specialists: readonly SpecialistName[] = [
      "observability-investigator",
      "deployment-investigator",
      "runbook-investigator",
    ];

    await coordinator.delegate<FakeFindings>({
      specialist: specialists[0] as SpecialistName,
      allowedTools: [],
      run: async () => ({ toolsUsed: [] }),
    });
    await coordinator.delegate<FakeFindings>({
      specialist: specialists[1] as SpecialistName,
      allowedTools: [],
      run: async () => ({ toolsUsed: [] }),
    });

    await expect(
      coordinator.delegate<FakeFindings>({
        specialist: specialists[2] as SpecialistName,
        allowedTools: [],
        run: async () => ({ toolsUsed: [] }),
      }),
    ).rejects.toThrow(DelegationBudgetExceededError);
  });
});
