// Shared backend access and environment-scope enforcement for incident
// tools (mirrors mcp/deployments/backend.ts). The runbook catalog itself is
// static reference content (see runbook-catalog.ts); the demo world is only
// consulted here to validate the session environment.
import {
  WorldNotSeededError,
  type WorldState,
} from "../../harness/demo/domain.js";
import type { DemoWorldStore } from "../../harness/demo/store.js";
import { BackendUnavailableError, EnvironmentMismatchError } from "./errors.js";

/** Loads the demo world, converting "not seeded" into a typed tool error. */
export function loadWorldOrThrow(store: DemoWorldStore): WorldState {
  try {
    return store.load();
  } catch (error) {
    if (error instanceof WorldNotSeededError) {
      throw new BackendUnavailableError(error.message);
    }
    throw error;
  }
}

/**
 * Enforces that a tool call's requested environment matches the session's
 * configured demo environment ("scope all queries to the session
 * environment").
 */
export function assertEnvironmentScope(
  world: WorldState,
  requestedEnvironment: string,
): void {
  if (requestedEnvironment !== world.environment) {
    throw new EnvironmentMismatchError(requestedEnvironment, world.environment);
  }
}
