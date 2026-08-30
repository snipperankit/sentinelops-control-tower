// Shared backend access, environment-scope enforcement, and recency-limit
// helpers for deployment tools. Every tool reads the same deterministic demo
// world (harness/demo) and enforces the same session-environment scope.
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
 * configured demo environment. This is the "scope all queries to the session
 * environment" requirement — every deployment tool calls this before reading
 * any deployment data.
 */
export function assertEnvironmentScope(
  world: WorldState,
  requestedEnvironment: string,
): void {
  if (requestedEnvironment !== world.environment) {
    throw new EnvironmentMismatchError(requestedEnvironment, world.environment);
  }
}

export interface RecencyLimitResult<T> {
  readonly items: readonly T[];
  readonly truncated: boolean;
  readonly omittedCount: number;
}

/**
 * Keeps at most the `limit` most-recent items from a chronologically
 * ascending list (the result-size limit), reporting how many older items
 * were omitted rather than silently dropping them.
 */
export function takeMostRecent<T>(
  items: readonly T[],
  limit: number,
): RecencyLimitResult<T> {
  const truncated = items.length > limit;
  const visible = truncated ? items.slice(-limit) : items;
  return {
    items: visible,
    truncated,
    omittedCount: items.length - visible.length,
  };
}
