// Freshness/provenance envelope builder for the deployment MCP tools,
// mirroring mcp/observability/provenance.ts's pattern.
import type { Clock } from "../../harness/demo/clock.js";

/** Deployment metadata is considered stale if it was recorded longer ago than this, relative to the tool call's clock. */
export const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes

export interface Provenance {
  readonly source: "sentinelops-demo-world";
  readonly environment: string;
  readonly retrievedAt: string;
  readonly worldRolledBack: boolean;
}

export function buildProvenance(
  clock: Clock,
  environment: string,
  worldRolledBack: boolean,
): Provenance {
  return {
    source: "sentinelops-demo-world",
    environment,
    retrievedAt: clock.now().toISOString(),
    worldRolledBack,
  };
}

/** True if `referenceTimestamp` is older than `STALE_AFTER_MS` relative to the clock. */
export function isStale(clock: Clock, referenceTimestamp: string): boolean {
  return (
    clock.now().getTime() - Date.parse(referenceTimestamp) > STALE_AFTER_MS
  );
}
