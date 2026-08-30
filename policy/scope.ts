// Session-scope and resource-scope enforcement. Every tool call must be
// scoped to the session's environment and the declared target resource
// (see .github/instructions/policy.instructions.md steps 6, "Check
// environment and resource scope").
import { ScopeMismatchError } from "./errors.js";

export interface SessionScope {
  readonly sessionId: string;
  readonly environment: string;
}

export function assertEnvironmentScope(
  session: SessionScope,
  requestedEnvironment: string,
): void {
  if (requestedEnvironment !== session.environment) {
    throw new ScopeMismatchError(
      "environment",
      session.environment,
      requestedEnvironment,
    );
  }
}

export function assertResourceScope(
  approvedResource: string,
  requestedResource: string,
): void {
  if (requestedResource !== approvedResource) {
    throw new ScopeMismatchError(
      "targetResource",
      approvedResource,
      requestedResource,
    );
  }
}
