// Typed errors for the deployment MCP tools. Every failure path returns a
// structured, typed error rather than crashing or leaking internals (see
// .github/instructions/mcp.instructions.md and SECURITY.md failure behavior).
//
// Unknown-deployment failures reuse harness/demo/domain.js's existing
// `UnknownDeploymentError` (thrown by `DemoWorldStore.getDeployment` and
// `getDeploymentDiff`) rather than redefining it here.

export abstract class DeploymentToolError extends Error {
  abstract readonly code: string;
}

/** Thrown when tool arguments fail schema validation. */
export class InvalidArgumentsError extends DeploymentToolError {
  readonly code = "INVALID_ARGUMENTS";

  constructor(readonly issues: readonly string[]) {
    super(`Invalid arguments: ${issues.join("; ")}`);
    this.name = "InvalidArgumentsError";
  }
}

/**
 * Thrown when a tool call's `environment` argument does not match the
 * session's configured demo environment. Enforces "scope all queries to the
 * session environment" (see policy.instructions.md, AGENTS.md).
 */
export class EnvironmentMismatchError extends DeploymentToolError {
  readonly code = "ENVIRONMENT_MISMATCH";

  constructor(
    readonly requestedEnvironment: string,
    readonly actualEnvironment: string,
  ) {
    super(
      `Requested environment "${requestedEnvironment}" does not match the session environment "${actualEnvironment}"`,
    );
    this.name = "EnvironmentMismatchError";
  }
}

/**
 * Thrown when the backing data source cannot serve the request (e.g. the
 * demo world has not been seeded). Tools must fail closed rather than return
 * partial or fabricated data.
 */
export class BackendUnavailableError extends DeploymentToolError {
  readonly code = "BACKEND_UNAVAILABLE";

  constructor(cause: string) {
    super(`Deployment backend unavailable: ${cause}`);
    this.name = "BackendUnavailableError";
  }
}

/**
 * Thrown by deployments.rollback when the caller's `currentDeploymentId`
 * (the deployment the approval was granted against) no longer matches the
 * world's actual active deployment. Defense-in-depth against a stale or
 * out-of-date premise — the state may have changed since approval was
 * granted.
 */
export class CurrentDeploymentMismatchError extends DeploymentToolError {
  readonly code = "CURRENT_DEPLOYMENT_MISMATCH";

  constructor(
    readonly expectedCurrentDeploymentId: string,
    readonly actualActiveDeploymentId: string,
  ) {
    super(
      `Approved current deployment "${expectedCurrentDeploymentId}" no longer matches the active deployment "${actualActiveDeploymentId}"`,
    );
    this.name = "CurrentDeploymentMismatchError";
  }
}

/** Thrown by deployments.rollback when the target deployment is not a healthy, allowlisted rollback target. */
export class TargetNotAllowlistedError extends DeploymentToolError {
  readonly code = "TARGET_NOT_ALLOWLISTED";

  constructor(
    readonly targetDeploymentId: string,
    readonly status: string,
  ) {
    super(
      `Target deployment "${targetDeploymentId}" is not allowlisted for rollback (status: ${status})`,
    );
    this.name = "TargetNotAllowlistedError";
  }
}

/**
 * Thrown by deployments.rollback when an idempotency key is reused with
 * different arguments than its original call. Prevents duplicate execution
 * while still rejecting reuse that looks like a conflicting or replayed
 * request (see AGENTS.md "Reused approvals must be rejected").
 */
export class DuplicateIdempotencyKeyError extends DeploymentToolError {
  readonly code = "DUPLICATE_IDEMPOTENCY_KEY";

  constructor(readonly idempotencyKey: string) {
    super(
      `Idempotency key "${idempotencyKey}" was already used with different arguments`,
    );
    this.name = "DuplicateIdempotencyKeyError";
  }
}
