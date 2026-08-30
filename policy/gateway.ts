// The policy gateway: the single entry point for authorizing any tool
// invocation. Implements the 10-step policy pipeline from
// .github/instructions/policy.instructions.md and wires together risk
// classification, scope enforcement, approval binding, kill-switch
// checks, and audit events. Fails closed when any component is
// unavailable (SECURITY.md invariant, ARCHITECTURE.md "Failure behavior").
import type { Clock } from "../harness/demo/clock.js";
import {
  canonicalizeArguments,
  hashArguments,
  validateApproval,
  type ApprovalStore,
} from "./approval.js";
import {
  ApprovalRequiredError,
  KillSwitchActiveError,
  PolicyServiceUnavailableError,
} from "./errors.js";
import type { KillSwitch } from "./kill-switch.js";
import { classifyToolRisk, requiresApproval } from "./risk.js";
import { assertEnvironmentScope, type SessionScope } from "./scope.js";
import type { AuthorizationDecision, PolicyAuditSink } from "./types.js";

export interface AuthorizationRequest {
  readonly sessionId: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  readonly environment: string;
  readonly targetResource: string;
  readonly approvalId?: string;
}

export interface PolicyGatewayDeps {
  readonly clock: Clock;
  readonly approvalStore: ApprovalStore;
  readonly auditSink: PolicyAuditSink;
  readonly killSwitch: KillSwitch;
  readonly sessionScope: SessionScope;
}

/**
 * Authorizes a single tool invocation. For read-only tools, returns
 * `allowed_read_only` immediately. For mutating tools, validates the
 * approval grant against every binding field. Throws a specific
 * `PolicyError` subclass for each denial reason. Emits an audit event
 * for every decision (allowed or denied).
 *
 * This function is the ONLY authorization path. The UI, the agent, and
 * the MCP adapter must all go through it — there is no shortcut (see
 * .github/instructions/policy.instructions.md "Never allow the UI to
 * bypass this layer").
 */
export function authorize(
  request: AuthorizationRequest,
  deps: PolicyGatewayDeps,
): AuthorizationDecision {
  try {
    return authorizeInternal(request, deps);
  } catch (error: unknown) {
    // Fail closed on unexpected errors.
    if (error instanceof Error && "code" in error) {
      // Known PolicyError — re-throw after audit.
      deps.auditSink.record({
        type: "tool.denied",
        occurredAt: deps.clock.now().toISOString(),
        sessionId: request.sessionId,
        toolName: request.toolName,
        outcome: "denied",
        reason: error.message,
        ...(request.approvalId !== undefined
          ? { approvalId: request.approvalId }
          : {}),
      });
      throw error;
    }
    // Unexpected / infrastructure error — deny and audit.
    deps.auditSink.record({
      type: "tool.denied",
      occurredAt: deps.clock.now().toISOString(),
      sessionId: request.sessionId,
      toolName: request.toolName,
      outcome: "denied",
      reason: `Policy service internal error: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw new PolicyServiceUnavailableError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function authorizeInternal(
  request: AuthorizationRequest,
  deps: PolicyGatewayDeps,
): AuthorizationDecision {
  // 1. Kill switch — checked first, overrides everything.
  if (deps.killSwitch.isActive()) {
    throw new KillSwitchActiveError();
  }

  // 2. Tool allowlist + risk classification (steps 2, 3, 5 of the policy pipeline).
  const toolEntry = classifyToolRisk(request.toolName);

  // 3. Environment scope (step 6).
  assertEnvironmentScope(deps.sessionScope, request.environment);

  // 4. Read-only tools pass without approval.
  if (!requiresApproval(toolEntry.risk)) {
    const decision: AuthorizationDecision = {
      outcome: "allowed_read_only",
      toolName: request.toolName,
      sessionId: request.sessionId,
      reason: `Read-only tool "${request.toolName}" does not require approval`,
    };
    deps.auditSink.record({
      type: "tool.authorized",
      occurredAt: deps.clock.now().toISOString(),
      sessionId: request.sessionId,
      toolName: request.toolName,
      outcome: "allowed_read_only",
      reason: decision.reason,
    });
    return decision;
  }

  // 5. Mutating tool — approval is mandatory.
  if (!request.approvalId) {
    throw new ApprovalRequiredError(request.toolName);
  }

  const grant = deps.approvalStore.get(request.approvalId);
  if (!grant) {
    throw new ApprovalRequiredError(request.toolName);
  }

  // 6. Canonical argument hash for the current request.
  const canonicalArgs = canonicalizeArguments(request.arguments);
  const argumentHash = hashArguments(canonicalArgs);

  // 7. Validate every binding field.
  validateApproval({
    grant,
    sessionId: request.sessionId,
    toolName: request.toolName,
    argumentHash,
    environment: request.environment,
    targetResource: request.targetResource,
    clock: deps.clock,
  });

  // 8. Mark consumed (one-time use).
  deps.approvalStore.markConsumed(grant.id);

  // 9. Emit audit event.
  const decision: AuthorizationDecision = {
    outcome: "allowed_with_approval",
    toolName: request.toolName,
    sessionId: request.sessionId,
    reason: `Mutating tool "${request.toolName}" authorized with approval "${grant.id}"`,
    approvalId: grant.id,
  };
  deps.auditSink.record({
    type: "tool.authorized",
    occurredAt: deps.clock.now().toISOString(),
    sessionId: request.sessionId,
    toolName: request.toolName,
    outcome: "allowed_with_approval",
    reason: decision.reason,
    approvalId: grant.id,
    approverIdentity: grant.approverIdentity,
  });

  return decision;
}
