// Typed errors for the policy layer. Every denial path returns a specific,
// structured error (see .github/instructions/policy.instructions.md,
// SECURITY.md "Approval security"). Generic policy errors never hide the
// specific denial reason from the caller or from audit.

export abstract class PolicyError extends Error {
  abstract readonly code: string;
}

export class UnknownToolError extends PolicyError {
  readonly code = "UNKNOWN_TOOL";
  constructor(readonly toolName: string) {
    super(`Unknown tool: "${toolName}" is not in the tool allowlist`);
    this.name = "UnknownToolError";
  }
}

export class ToolNotAllowedError extends PolicyError {
  readonly code = "TOOL_NOT_ALLOWED";
  constructor(
    readonly toolName: string,
    readonly reason: string,
  ) {
    super(`Tool "${toolName}" not allowed: ${reason}`);
    this.name = "ToolNotAllowedError";
  }
}

export class ApprovalRequiredError extends PolicyError {
  readonly code = "APPROVAL_REQUIRED";
  constructor(readonly toolName: string) {
    super(
      `Mutating tool "${toolName}" requires human approval before execution`,
    );
    this.name = "ApprovalRequiredError";
  }
}

export class ApprovalExpiredError extends PolicyError {
  readonly code = "APPROVAL_EXPIRED";
  constructor(
    readonly approvalId: string,
    readonly expiredAt: string,
  ) {
    super(`Approval "${approvalId}" expired at ${expiredAt}`);
    this.name = "ApprovalExpiredError";
  }
}

export class ApprovalAlreadyUsedError extends PolicyError {
  readonly code = "APPROVAL_ALREADY_USED";
  constructor(readonly approvalId: string) {
    super(`Approval "${approvalId}" has already been consumed (one-time use)`);
    this.name = "ApprovalAlreadyUsedError";
  }
}

export class ApprovalArgumentMismatchError extends PolicyError {
  readonly code = "APPROVAL_ARGUMENT_MISMATCH";
  constructor(readonly approvalId: string) {
    super(
      `Arguments do not match the approved canonical hash for approval "${approvalId}"`,
    );
    this.name = "ApprovalArgumentMismatchError";
  }
}

export class ApprovalSessionMismatchError extends PolicyError {
  readonly code = "APPROVAL_SESSION_MISMATCH";
  constructor(
    readonly approvalId: string,
    readonly expectedSession: string,
    readonly actualSession: string,
  ) {
    super(
      `Approval "${approvalId}" is bound to session "${expectedSession}", not "${actualSession}"`,
    );
    this.name = "ApprovalSessionMismatchError";
  }
}

export class ApprovalToolMismatchError extends PolicyError {
  readonly code = "APPROVAL_TOOL_MISMATCH";
  constructor(
    readonly approvalId: string,
    readonly expectedTool: string,
    readonly actualTool: string,
  ) {
    super(
      `Approval "${approvalId}" is bound to tool "${expectedTool}", not "${actualTool}"`,
    );
    this.name = "ApprovalToolMismatchError";
  }
}

export class ApprovalEnvironmentMismatchError extends PolicyError {
  readonly code = "APPROVAL_ENVIRONMENT_MISMATCH";
  constructor(
    readonly approvalId: string,
    readonly expectedEnv: string,
    readonly actualEnv: string,
  ) {
    super(
      `Approval "${approvalId}" is bound to environment "${expectedEnv}", not "${actualEnv}"`,
    );
    this.name = "ApprovalEnvironmentMismatchError";
  }
}

export class ApprovalResourceMismatchError extends PolicyError {
  readonly code = "APPROVAL_RESOURCE_MISMATCH";
  constructor(readonly approvalId: string) {
    super(
      `Target resource does not match the approved resource for approval "${approvalId}"`,
    );
    this.name = "ApprovalResourceMismatchError";
  }
}

export class UnauthorizedApproverError extends PolicyError {
  readonly code = "UNAUTHORIZED_APPROVER";
  constructor(readonly approverIdentity: string) {
    super(`"${approverIdentity}" is not an authorized approver`);
    this.name = "UnauthorizedApproverError";
  }
}

export class KillSwitchActiveError extends PolicyError {
  readonly code = "KILL_SWITCH_ACTIVE";
  constructor() {
    super("Kill switch is active — all mutations are denied");
    this.name = "KillSwitchActiveError";
  }
}

export class PolicyServiceUnavailableError extends PolicyError {
  readonly code = "POLICY_SERVICE_UNAVAILABLE";
  readonly detail: string;
  constructor(detail: string) {
    super(
      `Policy service unavailable — mutation denied (fail closed): ${detail}`,
    );
    this.name = "PolicyServiceUnavailableError";
    this.detail = detail;
  }
}

export class ScopeMismatchError extends PolicyError {
  readonly code = "SCOPE_MISMATCH";
  constructor(
    readonly field: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Scope mismatch on "${field}": expected "${expected}", got "${actual}"`,
    );
    this.name = "ScopeMismatchError";
  }
}
