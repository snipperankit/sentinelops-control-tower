// Typed errors for the observability MCP tools. Every failure path returns a
// structured, typed error rather than crashing or leaking internals (see
// .github/instructions/mcp.instructions.md and SECURITY.md failure behavior).

export abstract class ObservabilityToolError extends Error {
  abstract readonly code: string;
}

/** Thrown when tool arguments fail schema or scope validation. */
export class InvalidArgumentsError extends ObservabilityToolError {
  readonly code = "INVALID_ARGUMENTS";

  constructor(readonly issues: readonly string[]) {
    super(`Invalid arguments: ${issues.join("; ")}`);
    this.name = "InvalidArgumentsError";
  }
}

/**
 * Thrown when the backing data source cannot serve the request (e.g. the
 * demo world has not been seeded). Tools must fail closed rather than return
 * partial or fabricated data.
 */
export class BackendUnavailableError extends ObservabilityToolError {
  readonly code = "BACKEND_UNAVAILABLE";

  constructor(cause: string) {
    super(`Observability backend unavailable: ${cause}`);
    this.name = "BackendUnavailableError";
  }
}
