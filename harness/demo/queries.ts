// Read-only query API over the demo world, mirroring the investigation queries
// listed in PRODUCT_SPEC.md (error rates, latency, deployments, deployment diffs).
import {
  UnknownDeploymentError,
  type Deployment,
  type DeploymentId,
  type MetricPoint,
  type ServiceName,
} from "./domain.js";
import type { DemoWorldStore } from "./store.js";

export interface DeploymentDiff {
  readonly deployment: Deployment;
  readonly previous?: Deployment;
  readonly checkoutTimeoutMsDelta?: number;
}

export function listDeployments(store: DemoWorldStore): readonly Deployment[] {
  return [...store.getDeployments()].sort((a, b) =>
    a.deployedAt.localeCompare(b.deployedAt),
  );
}

export function getDeploymentDiff(
  store: DemoWorldStore,
  id: DeploymentId,
): DeploymentDiff {
  const deployments = listDeployments(store);
  const index = deployments.findIndex((d) => d.id === id);
  const deployment = deployments[index];
  if (index === -1 || !deployment) {
    throw new UnknownDeploymentError(id);
  }

  const previous = index > 0 ? deployments[index - 1] : undefined;

  return {
    deployment,
    ...(previous && {
      previous,
      checkoutTimeoutMsDelta:
        deployment.checkoutTimeoutMs - previous.checkoutTimeoutMs,
    }),
  };
}

export function queryErrorRate(
  store: DemoWorldStore,
  service: ServiceName = "checkout",
): readonly MetricPoint[] {
  return store.getMetrics({ service, metric: "error_rate" });
}

export function queryLatencyP95Ms(
  store: DemoWorldStore,
  service: ServiceName = "checkout",
): readonly MetricPoint[] {
  return store.getMetrics({ service, metric: "latency_p95_ms" });
}
