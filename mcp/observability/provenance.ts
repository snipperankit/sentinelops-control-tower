// Freshness and provenance metadata attached to every observability tool
// response ("Tool results must include provenance where appropriate",
// .github/instructions/mcp.instructions.md).
import type { Clock } from "../../harness/demo/clock.js";

export const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes

export interface Provenance {
  readonly source: "sentinelops-demo-world";
  readonly retrievedAt: string;
  readonly worldRolledBack: boolean;
}

export interface Freshness {
  readonly provenance: Provenance;
  readonly stale: boolean;
}

/**
 * Builds the provenance envelope and staleness flag for a tool response.
 * Data is considered stale when the latest matching data point is older than
 * `STALE_AFTER_MS` relative to the injected clock, or when nothing matched at
 * all (freshness cannot be verified, so it is never reported as fresh).
 */
export function buildFreshness(
  clock: Clock,
  worldRolledBack: boolean,
  latestTimestamp: string | undefined,
): Freshness {
  const retrievedAt = clock.now();
  const stale =
    latestTimestamp === undefined ||
    retrievedAt.getTime() - Date.parse(latestTimestamp) > STALE_AFTER_MS;

  return {
    provenance: {
      source: "sentinelops-demo-world",
      retrievedAt: retrievedAt.toISOString(),
      worldRolledBack,
    },
    stale,
  };
}
