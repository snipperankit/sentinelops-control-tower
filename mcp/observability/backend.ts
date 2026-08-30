// Shared backend access and windowing/size-limit helpers for observability
// tools. Every tool reads the same deterministic demo world (harness/demo)
// and applies the same time-window filter, chronological sort, and
// result-size limit so behavior is consistent across tools.
import {
  WorldNotSeededError,
  type WorldState,
} from "../../harness/demo/domain.js";
import type { DemoWorldStore } from "../../harness/demo/store.js";
import { BackendUnavailableError } from "./errors.js";

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

export interface WindowFilterOptions<T> {
  readonly items: readonly T[];
  readonly from: string;
  readonly to: string;
  readonly limit: number;
  readonly timestampOf: (item: T) => string;
}

export interface WindowFilterResult<T> {
  readonly items: readonly T[];
  readonly truncated: boolean;
  readonly omittedCount: number;
  readonly latestTimestamp: string | undefined;
}

/**
 * Filters `items` to those within `[from, to]`, sorts them chronologically,
 * and keeps at most the most recent `limit` items (the result-size limit).
 * The most recent items are kept — rather than the earliest — because recent
 * behavior is what matters most for incident response; `omittedCount` tells
 * the caller how much older data was cut so it can narrow the query.
 */
export function filterWindowAndLimit<T>(
  options: WindowFilterOptions<T>,
): WindowFilterResult<T> {
  const { items, from, to, limit, timestampOf } = options;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  const inWindow = items
    .filter((item) => {
      const ts = Date.parse(timestampOf(item));
      return ts >= fromMs && ts <= toMs;
    })
    .slice()
    .sort((a, b) => timestampOf(a).localeCompare(timestampOf(b)));

  const latest = inWindow.at(-1);
  const latestTimestamp =
    latest === undefined ? undefined : timestampOf(latest);
  const truncated = inWindow.length > limit;
  const visible = truncated ? inWindow.slice(-limit) : inWindow;

  return {
    items: visible,
    truncated,
    omittedCount: inWindow.length - visible.length,
    latestTimestamp,
  };
}
