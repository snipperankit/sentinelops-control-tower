import { describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import {
  canonicalizeArguments,
  createApproval,
  hashArguments,
  InMemoryApprovalStore,
  DEFAULT_APPROVAL_TTL_MS,
} from "../../policy/approval.js";
import {
  ApprovalAlreadyUsedError,
  ApprovalArgumentMismatchError,
  ApprovalExpiredError,
  ApprovalRequiredError,
  KillSwitchActiveError,
  PolicyServiceUnavailableError,
  ScopeMismatchError,
  UnauthorizedApproverError,
  UnknownToolError,
} from "../../policy/errors.js";
import {
  authorize,
  type AuthorizationRequest,
  type PolicyGatewayDeps,
} from "../../policy/gateway.js";
import { KillSwitch } from "../../policy/kill-switch.js";
import {
  InMemoryPolicyAuditSink,
  type ApprovalRequest,
} from "../../policy/types.js";

const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

function makeRollbackArgs(): Record<string, unknown> {
  return {
    service: "checkout",
    environment: "staging",
    currentDeploymentId: "deploy-4c9a",
    targetDeploymentId: "deploy-3b7f",
    idempotencyKey: "idem-1",
  };
}

function makeApprovalRequest(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  const args = makeRollbackArgs();
  const canonicalArgs = canonicalizeArguments(args);
  return {
    sessionId: "session-1",
    toolName: "deployments.rollback",
    canonicalArgs,
    argumentHash: hashArguments(canonicalArgs),
    environment: "staging",
    targetResource: "checkout",
    riskLevel: "mutating",
    ...overrides,
  };
}

interface TestHarness {
  clock: FixedClock;
  auditSink: InMemoryPolicyAuditSink;
  approvalStore: InMemoryApprovalStore;
  killSwitch: KillSwitch;
  deps: PolicyGatewayDeps;
}

function createHarness(): TestHarness {
  const clock = new FixedClock(FIXED_NOW);
  const auditSink = new InMemoryPolicyAuditSink();
  const approvalStore = new InMemoryApprovalStore();
  const killSwitch = new KillSwitch(clock, auditSink);
  const deps: PolicyGatewayDeps = {
    clock,
    approvalStore,
    auditSink,
    killSwitch,
    sessionScope: { sessionId: "session-1", environment: "staging" },
  };
  return { clock, auditSink, approvalStore, killSwitch, deps };
}

function grantApproval(
  h: TestHarness,
  overrides: Partial<ApprovalRequest> = {},
): string {
  const request = makeApprovalRequest(overrides);
  const grant = createApproval({
    request,
    approverIdentity: "operator",
    clock: h.clock,
  });
  h.approvalStore.put(grant);
  return grant.id;
}

describe("policy gateway: read-only tools", () => {
  it("allows a read-only tool without any approval", () => {
    const h = createHarness();
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "observability.get_error_rates",
      arguments: { service: "checkout", from: "t0", to: "t1" },
      environment: "staging",
      targetResource: "checkout",
    };

    const decision = authorize(request, h.deps);

    expect(decision.outcome).toBe("allowed_read_only");
    expect(h.auditSink.list()).toHaveLength(1);
    expect(h.auditSink.list()[0]?.type).toBe("tool.authorized");
  });
});

describe("policy gateway: rollback denied before approval", () => {
  it("denies a mutating tool when no approval is provided", () => {
    const h = createHarness();
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
    };

    expect(() => authorize(request, h.deps)).toThrow(ApprovalRequiredError);
  });
});

describe("policy gateway: correct approval permits exact rollback", () => {
  it("authorizes a mutating tool with a valid, matching approval", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    const decision = authorize(request, h.deps);

    expect(decision.outcome).toBe("allowed_with_approval");
    expect(decision.approvalId).toBe(approvalId);
    const grants = h.approvalStore.list();
    expect(grants.find((g) => g.id === approvalId)?.consumed).toBe(true);
  });
});

describe("policy gateway: changed deployment ID is rejected", () => {
  it("rejects when the request arguments differ from the approved hash", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);

    const changedArgs = {
      ...makeRollbackArgs(),
      targetDeploymentId: "deploy-DIFFERENT",
    };
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: changedArgs,
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    expect(() => authorize(request, h.deps)).toThrow(
      ApprovalArgumentMismatchError,
    );
  });
});

describe("policy gateway: changed environment is rejected", () => {
  it("rejects when the request environment does not match the session scope", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "production",
      targetResource: "checkout",
      approvalId,
    };

    expect(() => authorize(request, h.deps)).toThrow(ScopeMismatchError);
  });
});

describe("policy gateway: changed service is rejected", () => {
  it("rejects when the request arguments contain a different service", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);

    const changedArgs = { ...makeRollbackArgs(), service: "payments-gateway" };
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: changedArgs,
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    expect(() => authorize(request, h.deps)).toThrow(
      ApprovalArgumentMismatchError,
    );
  });
});

describe("policy gateway: expired approval is rejected", () => {
  it("rejects an approval that has passed its expiry time", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);

    // Advance clock past the TTL.
    const expiredClock = new FixedClock(
      new Date(FIXED_NOW.getTime() + DEFAULT_APPROVAL_TTL_MS + 1),
    );
    const expiredDeps: PolicyGatewayDeps = { ...h.deps, clock: expiredClock };

    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    expect(() => authorize(request, expiredDeps)).toThrow(ApprovalExpiredError);
  });
});

describe("policy gateway: replayed approval is rejected", () => {
  it("rejects a second use of a consumed one-time approval", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    authorize(request, h.deps);

    expect(() => authorize(request, h.deps)).toThrow(ApprovalAlreadyUsedError);
  });
});

describe("policy gateway: unauthorized approver is rejected", () => {
  it("rejects an approval created by an unauthorized identity", () => {
    const h = createHarness();

    expect(() =>
      createApproval({
        request: makeApprovalRequest(),
        approverIdentity: "random-user",
        clock: h.clock,
      }),
    ).toThrow(UnauthorizedApproverError);
  });
});

describe("policy gateway: policy-service outage denies mutation", () => {
  it("denies mutation and fails closed when an unexpected error occurs", () => {
    const h = createHarness();
    // Corrupt the deps to simulate a policy-service internal failure by
    // providing an approval store that throws on access.
    const brokenDeps: PolicyGatewayDeps = {
      ...h.deps,
      approvalStore: {
        get: () => {
          throw new Error("store connection lost");
        },
        put: () => {},
        markConsumed: () => {},
        list: () => [],
      },
    };

    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId: "some-approval-id",
    };

    expect(() => authorize(request, brokenDeps)).toThrow(
      PolicyServiceUnavailableError,
    );
  });
});

describe("policy gateway: kill switch revokes authorization", () => {
  it("denies all mutations when the kill switch is active, even with a valid approval", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);
    h.killSwitch.activate();

    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    expect(() => authorize(request, h.deps)).toThrow(KillSwitchActiveError);
  });

  it("resumes after deactivation", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);
    h.killSwitch.activate();
    h.killSwitch.deactivate();

    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    const decision = authorize(request, h.deps);
    expect(decision.outcome).toBe("allowed_with_approval");
  });
});

describe("policy gateway: UI cannot bypass policy", () => {
  it("rejects an unknown tool that might be called from the UI directly", () => {
    const h = createHarness();
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "ui.direct_rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
    };

    expect(() => authorize(request, h.deps)).toThrow(UnknownToolError);
  });

  it("rejects a valid tool name without approval (simulating a direct UI call)", () => {
    const h = createHarness();
    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      // No approvalId — the UI tried to skip the approval step.
    };

    expect(() => authorize(request, h.deps)).toThrow(ApprovalRequiredError);
  });
});

describe("policy: canonical argument serialization", () => {
  it("produces the same hash regardless of key insertion order", () => {
    const a = { service: "checkout", environment: "staging", id: "1" };
    const b = { id: "1", environment: "staging", service: "checkout" };
    expect(canonicalizeArguments(a)).toBe(canonicalizeArguments(b));
    expect(hashArguments(canonicalizeArguments(a))).toBe(
      hashArguments(canonicalizeArguments(b)),
    );
  });

  it("produces different hashes for different argument values", () => {
    const a = canonicalizeArguments({
      service: "checkout",
      target: "deploy-1",
    });
    const b = canonicalizeArguments({
      service: "checkout",
      target: "deploy-2",
    });
    expect(hashArguments(a)).not.toBe(hashArguments(b));
  });
});

describe("policy: approval session mismatch", () => {
  it("rejects when the approval was granted for a different session", () => {
    const h = createHarness();
    const approvalId = grantApproval(h);

    const request: AuthorizationRequest = {
      sessionId: "session-OTHER",
      toolName: "deployments.rollback",
      arguments: makeRollbackArgs(),
      environment: "staging",
      targetResource: "checkout",
      approvalId,
    };

    // Session scope checks session-level environment, but since
    // session-OTHER may have the same environment, the failure should come
    // from the approval binding's session check. To isolate this, we use
    // deps with a matching environment but a different session id.
    const otherSessionDeps: PolicyGatewayDeps = {
      ...h.deps,
      sessionScope: { sessionId: "session-OTHER", environment: "staging" },
    };

    expect(() => authorize(request, otherSessionDeps)).toThrow(
      expect.objectContaining({ code: "APPROVAL_SESSION_MISMATCH" }),
    );
  });
});

describe("threat-review regressions", () => {
  it("rejects a grant with a forged approverIdentity injected directly into the store", () => {
    const h = createHarness();
    const args = makeRollbackArgs();
    const canonicalArgs = canonicalizeArguments(args);
    const argumentHash = hashArguments(canonicalArgs);

    const forgedGrant = {
      id: "forged-grant-1",
      sessionId: "session-1",
      toolName: "deployments.rollback",
      argumentHash,
      environment: "staging",
      targetResource: "checkout",
      riskLevel: "mutating" as const,
      approverIdentity: "hacker",
      grantedAt: h.clock.now().toISOString(),
      expiresAt: new Date(h.clock.now().getTime() + 300_000).toISOString(),
      consumed: false,
    };
    h.approvalStore.put(forgedGrant);

    const request: AuthorizationRequest = {
      sessionId: "session-1",
      toolName: "deployments.rollback",
      arguments: args,
      environment: "staging",
      targetResource: "checkout",
      approvalId: "forged-grant-1",
    };

    expect(() => authorize(request, h.deps)).toThrow(UnauthorizedApproverError);
  });

  it("does not export a function to add approvers at runtime", async () => {
    const policyExports = await import("../../policy/index.js");
    expect("addAuthorizedApprover" in policyExports).toBe(false);
  });

  it("model cannot approve its own action (model identity is not an authorized approver)", () => {
    const h = createHarness();
    expect(() =>
      createApproval({
        request: makeApprovalRequest(),
        approverIdentity: "model",
        clock: h.clock,
      }),
    ).toThrow(UnauthorizedApproverError);
  });
});
