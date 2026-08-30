// Barrel export for the policy layer.
export {
  PolicyError,
  UnknownToolError,
  ToolNotAllowedError,
  ApprovalRequiredError,
  ApprovalExpiredError,
  ApprovalAlreadyUsedError,
  ApprovalArgumentMismatchError,
  ApprovalSessionMismatchError,
  ApprovalToolMismatchError,
  ApprovalEnvironmentMismatchError,
  ApprovalResourceMismatchError,
  UnauthorizedApproverError,
  KillSwitchActiveError,
  PolicyServiceUnavailableError,
  ScopeMismatchError,
} from "./errors.js";

export {
  type RiskLevel,
  type ToolRiskEntry,
  type ApprovalRequest,
  type ApprovalGrant,
  type AuthorizationOutcome,
  type AuthorizationDecision,
  type PolicyAuditEventType,
  type PolicyAuditEvent,
  type PolicyAuditSink,
  type PolicyDependencies,
  InMemoryPolicyAuditSink,
} from "./types.js";

export {
  classifyToolRisk,
  isToolAllowed,
  requiresApproval,
  listAllowedTools,
} from "./risk.js";

export {
  assertEnvironmentScope,
  assertResourceScope,
  type SessionScope,
} from "./scope.js";

export {
  canonicalizeArguments,
  hashArguments,
  createApproval,
  validateApproval,
  isAuthorizedApprover,
  InMemoryApprovalStore,
  FileApprovalStore,
  DEFAULT_APPROVAL_TTL_MS,
  type ApprovalStore,
  type CreateApprovalOptions,
  type ValidateApprovalOptions,
} from "./approval.js";

export { KillSwitch } from "./kill-switch.js";

export {
  authorize,
  type AuthorizationRequest,
  type PolicyGatewayDeps,
} from "./gateway.js";
