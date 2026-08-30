// Typed errors for the sandbox runner. Every failure path returns a
// structured, typed error rather than crashing or leaking internals (see
// .github/instructions/sandbox.instructions.md and SECURITY.md failure
// behavior). Resource-limit violations during execution are NOT modeled as
// thrown errors — they are reported as part of the structured
// SandboxExecutionResult (see contract.ts) per that instruction file.

export abstract class SandboxError extends Error {
  abstract readonly code: string;
}

/** Thrown when an execution request fails schema validation. */
export class InvalidExecutionRequestError extends SandboxError {
  readonly code = "INVALID_EXECUTION_REQUEST";

  constructor(readonly issues: readonly string[]) {
    super(`Invalid sandbox execution request: ${issues.join("; ")}`);
    this.name = "InvalidExecutionRequestError";
  }
}

/**
 * Thrown when a requested input fixture name is not a plain basename inside
 * the approved fixtures root (see fixtures.ts) — covers path traversal
 * (`..`, absolute paths, path separators) and references to fixtures that
 * do not exist in the allowlist.
 */
export class FixtureNotApprovedError extends SandboxError {
  readonly code = "FIXTURE_NOT_APPROVED";

  constructor(readonly requestedName: string) {
    super(`Input fixture "${requestedName}" is not an approved fixture`);
    this.name = "FixtureNotApprovedError";
  }
}

/**
 * Thrown when the sandbox's isolation backend (Docker) is not reachable.
 * The runner must fail closed here rather than falling back to running
 * generated code directly on the host (see SECURITY.md invariant 5 and the
 * sandbox instructions' non-negotiable isolation requirements).
 */
export class SandboxUnavailableError extends SandboxError {
  readonly code = "SANDBOX_UNAVAILABLE";

  constructor(cause: string) {
    super(`Sandbox isolation backend unavailable: ${cause}`);
    this.name = "SandboxUnavailableError";
  }
}

/** Thrown when the temporary workspace cannot be created or populated. */
export class WorkspacePreparationError extends SandboxError {
  readonly code = "WORKSPACE_PREPARATION_FAILED";

  constructor(cause: string) {
    super(`Failed to prepare sandbox workspace: ${cause}`);
    this.name = "WorkspacePreparationError";
  }
}
