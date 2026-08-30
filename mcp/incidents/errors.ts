// Typed errors for the incidents MCP server. Every failure path returns a
// structured, typed error rather than crashing or leaking internals (see
// .github/instructions/mcp.instructions.md and SECURITY.md failure behavior).

export abstract class IncidentToolError extends Error {
  abstract readonly code: string;
}

/** Thrown when tool arguments fail schema validation. */
export class InvalidArgumentsError extends IncidentToolError {
  readonly code = "INVALID_ARGUMENTS";

  constructor(readonly issues: readonly string[]) {
    super(`Invalid arguments: ${issues.join("; ")}`);
    this.name = "InvalidArgumentsError";
  }
}

/**
 * Thrown when a tool call's `environment` argument does not match the
 * session's configured demo environment (see policy.instructions.md,
 * AGENTS.md "scope all queries to the session environment").
 */
export class EnvironmentMismatchError extends IncidentToolError {
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

/** Thrown when the backing data source cannot serve the request (e.g. the demo world has not been seeded). */
export class BackendUnavailableError extends IncidentToolError {
  readonly code = "BACKEND_UNAVAILABLE";

  constructor(cause: string) {
    super(`Incidents backend unavailable: ${cause}`);
    this.name = "BackendUnavailableError";
  }
}

/** Thrown when no runbook is catalogued for the requested service. */
export class RunbookNotFoundError extends IncidentToolError {
  readonly code = "RUNBOOK_NOT_FOUND";

  constructor(readonly service: string) {
    super(`No runbook is catalogued for service "${service}"`);
    this.name = "RunbookNotFoundError";
  }
}
