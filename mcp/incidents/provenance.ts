// Provenance envelope builder for the incidents MCP server, mirroring
// mcp/deployments/provenance.ts's pattern. Runbook content is static
// reference data (not tied to world rollback state), so the envelope omits
// a staleness flag.
import type { Clock } from "../../harness/demo/clock.js";

export interface Provenance {
  readonly source: "sentinelops-runbook-catalog";
  readonly environment: string;
  readonly retrievedAt: string;
}

export function buildProvenance(clock: Clock, environment: string): Provenance {
  return {
    source: "sentinelops-runbook-catalog",
    environment,
    retrievedAt: clock.now().toISOString(),
  };
}
