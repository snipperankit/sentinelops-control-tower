// Typed errors for the context MCP tools (GitHub, Bitbucket, web search).
// Every failure path returns a structured, typed error rather than crashing
// or leaking internals (see .github/instructions/mcp.instructions.md).

export abstract class ContextToolError extends Error {
  abstract readonly code: string;
}

/** Thrown when tool arguments fail schema validation. */
export class InvalidArgumentsError extends ContextToolError {
  readonly code = "INVALID_ARGUMENTS";

  constructor(readonly issues: readonly string[]) {
    super(`Invalid arguments: ${issues.join("; ")}`);
    this.name = "InvalidArgumentsError";
  }
}

/**
 * Thrown when the backing external service (GitHub/Bitbucket/search API)
 * cannot serve the request. Tools must fail closed rather than return
 * partial or fabricated data.
 */
export class BackendUnavailableError extends ContextToolError {
  readonly code = "BACKEND_UNAVAILABLE";

  constructor(cause: string) {
    super(`Context backend unavailable: ${cause}`);
    this.name = "BackendUnavailableError";
  }
}
