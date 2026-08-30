// Domain types and typed errors for the deterministic SentinelOps demo world.
// See PRODUCT_SPEC.md (demo scenario) and ARCHITECTURE.md (deterministic demo environment).

export type DeploymentId = "4c18" | "4c19" | "4c20" | "4c21";

export type DeploymentStatus = "healthy" | "suspect" | "rolled-back";

export interface Deployment {
  readonly id: DeploymentId;
  readonly deployedAt: string;
  readonly status: DeploymentStatus;
  readonly changeSummary: string;
  readonly checkoutTimeoutMs: number;
}

export const SERVICE_NAMES = [
  "checkout",
  "payments-gateway",
  "inventory",
  "shipping",
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export type MetricName = "error_rate" | "latency_p95_ms";

export interface MetricPoint {
  readonly service: ServiceName;
  readonly metric: MetricName;
  readonly timestamp: string;
  readonly value: number;
}

export interface RollbackRecord {
  readonly fromDeploymentId: DeploymentId;
  readonly toDeploymentId: DeploymentId;
  readonly requestedAt: string;
}

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  readonly id: string;
  readonly service: ServiceName;
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly deploymentId?: DeploymentId;
}

export const TRACE_STATUSES = ["ok", "error"] as const;

export type TraceStatus = (typeof TRACE_STATUSES)[number];

export interface TraceSpan {
  readonly traceId: string;
  readonly service: ServiceName;
  readonly operation: string;
  readonly timestamp: string;
  readonly durationMs: number;
  readonly status: TraceStatus;
}

export interface WorldState {
  /** Identifies the single demo environment this world represents; tool calls must be scoped to it (see policy.instructions.md "environment and resource scope"). */
  readonly environment: string;
  readonly activeDeploymentId: DeploymentId;
  readonly deployments: readonly Deployment[];
  readonly metrics: readonly MetricPoint[];
  readonly logs: readonly LogEntry[];
  readonly traces: readonly TraceSpan[];
  readonly rolledBack: boolean;
  readonly rollbackHistory: readonly RollbackRecord[];
}

export class WorldNotSeededError extends Error {
  readonly code = "WORLD_NOT_SEEDED";

  constructor() {
    super('Demo world not seeded. Run "npm run demo:seed" first.');
    this.name = "WorldNotSeededError";
  }
}

export class UnknownDeploymentError extends Error {
  readonly code = "UNKNOWN_DEPLOYMENT";

  constructor(readonly deploymentId: string) {
    super(`Unknown deployment id: ${deploymentId}`);
    this.name = "UnknownDeploymentError";
  }
}

export class InvalidRollbackTargetError extends Error {
  readonly code = "INVALID_ROLLBACK_TARGET";

  constructor(
    readonly deploymentId: DeploymentId,
    reason: string,
  ) {
    super(`Cannot roll back to ${deploymentId}: ${reason}`);
    this.name = "InvalidRollbackTargetError";
  }
}
