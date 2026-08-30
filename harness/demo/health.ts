// Domain-level health check for the demo world's structural invariants
// (distinct from harness/healthcheck.ts, which checks the local toolchain).
import type { DemoWorldStore } from "./store.js";

export interface WorldHealthCheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

export function checkWorldHealth(
  store: DemoWorldStore,
): readonly WorldHealthCheckResult[] {
  if (!store.isSeeded()) {
    return [
      {
        name: "world-seeded",
        ok: false,
        detail: 'run "npm run demo:seed"',
      },
    ];
  }

  const results: WorldHealthCheckResult[] = [
    { name: "world-seeded", ok: true },
  ];

  try {
    const state = store.load();

    results.push({
      name: "active-deployment-exists",
      ok: state.deployments.some((d) => d.id === state.activeDeploymentId),
      detail: state.activeDeploymentId,
    });

    const uniqueIds = new Set(state.deployments.map((d) => d.id));
    results.push({
      name: "deployment-ids-unique",
      ok: uniqueIds.size === state.deployments.length,
    });

    results.push({
      name: "metrics-well-formed",
      ok: state.metrics.every(
        (point) =>
          typeof point.service === "string" &&
          typeof point.metric === "string" &&
          typeof point.value === "number" &&
          typeof point.timestamp === "string",
      ),
    });

    results.push({
      name: "rollback-flag-consistent",
      ok: state.rolledBack === state.rollbackHistory.length > 0,
    });
  } catch (error) {
    results.push({
      name: "world-state-parses",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
}
