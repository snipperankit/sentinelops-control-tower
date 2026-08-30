// Deterministic, file-backed store for the demo world. No SQL engine required:
// state is a single JSON document under .demo-state/, matching the "SQLite or
// deterministic fixture storage" guidance in .github/copilot-instructions.md.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import {
  InvalidRollbackTargetError,
  UnknownDeploymentError,
  WorldNotSeededError,
  type Deployment,
  type DeploymentId,
  type MetricName,
  type MetricPoint,
  type RollbackRecord,
  type ServiceName,
  type WorldState,
} from "./domain.js";

export interface MetricQuery {
  readonly service?: ServiceName;
  readonly metric?: MetricName;
}

export interface DemoWorldStoreOptions {
  readonly seedFixturePath?: string;
  readonly recoveryMetricsFixturePath?: string;
  readonly stateFilePath?: string;
  readonly clock?: Clock;
}

const DEFAULT_SEED_FIXTURE = resolve(
  process.cwd(),
  "harness/demo/fixtures/world.json",
);
const DEFAULT_RECOVERY_FIXTURE = resolve(
  process.cwd(),
  "harness/demo/fixtures/recovery-metrics.json",
);
const DEFAULT_STATE_FILE = resolve(process.cwd(), ".demo-state/world.json");

export class DemoWorldStore {
  private readonly seedFixturePath: string;
  private readonly recoveryMetricsFixturePath: string;
  private readonly stateFilePath: string;
  private readonly clock: Clock;

  constructor(options: DemoWorldStoreOptions = {}) {
    this.seedFixturePath = options.seedFixturePath ?? DEFAULT_SEED_FIXTURE;
    this.recoveryMetricsFixturePath =
      options.recoveryMetricsFixturePath ?? DEFAULT_RECOVERY_FIXTURE;
    this.stateFilePath = options.stateFilePath ?? DEFAULT_STATE_FILE;
    this.clock = options.clock ?? new SystemClock();
  }

  isSeeded(): boolean {
    return existsSync(this.stateFilePath);
  }

  seed(): WorldState {
    if (!existsSync(this.seedFixturePath)) {
      throw new Error(`Seed fixture not found: ${this.seedFixturePath}`);
    }
    const state = JSON.parse(
      readFileSync(this.seedFixturePath, "utf-8"),
    ) as WorldState;
    this.write(state);
    return state;
  }

  reset(): void {
    if (existsSync(this.stateFilePath)) {
      rmSync(this.stateFilePath, { force: true });
    }
  }

  load(): WorldState {
    if (!this.isSeeded()) {
      throw new WorldNotSeededError();
    }
    return JSON.parse(readFileSync(this.stateFilePath, "utf-8")) as WorldState;
  }

  getDeployments(): readonly Deployment[] {
    return this.load().deployments;
  }

  getDeployment(id: DeploymentId): Deployment {
    const deployment = this.load().deployments.find((d) => d.id === id);
    if (!deployment) {
      throw new UnknownDeploymentError(id);
    }
    return deployment;
  }

  getActiveDeployment(): Deployment {
    return this.getDeployment(this.load().activeDeploymentId);
  }

  getMetrics(query: MetricQuery = {}): readonly MetricPoint[] {
    return this.load().metrics.filter(
      (point) =>
        (query.service === undefined || point.service === query.service) &&
        (query.metric === undefined || point.metric === query.metric),
    );
  }

  getLatestMetric(
    service: ServiceName,
    metric: MetricName,
  ): MetricPoint | undefined {
    return this.getMetrics({ service, metric }).reduce<MetricPoint | undefined>(
      (latest, point) => {
        if (!latest || point.timestamp > latest.timestamp) {
          return point;
        }
        return latest;
      },
      undefined,
    );
  }

  /** Rolls back the active deployment to `targetId`, appending recovery metrics. */
  rollbackTo(targetId: DeploymentId): RollbackRecord {
    const state = this.load();

    const target = state.deployments.find((d) => d.id === targetId);
    if (!target) {
      throw new UnknownDeploymentError(targetId);
    }
    if (target.id === state.activeDeploymentId) {
      throw new InvalidRollbackTargetError(
        targetId,
        "target deployment is already active",
      );
    }
    if (target.status === "rolled-back") {
      throw new InvalidRollbackTargetError(
        targetId,
        "target deployment was itself rolled back",
      );
    }

    const active = state.deployments.find(
      (d) => d.id === state.activeDeploymentId,
    );
    if (!active) {
      throw new UnknownDeploymentError(state.activeDeploymentId);
    }

    const record: RollbackRecord = {
      fromDeploymentId: active.id,
      toDeploymentId: targetId,
      requestedAt: this.clock.now().toISOString(),
    };

    const nextState: WorldState = {
      environment: state.environment,
      activeDeploymentId: targetId,
      deployments: state.deployments.map((deployment) =>
        deployment.id === active.id
          ? { ...deployment, status: "rolled-back" }
          : deployment,
      ),
      metrics: [...state.metrics, ...this.loadRecoveryMetrics()],
      logs: state.logs,
      traces: state.traces,
      rolledBack: true,
      rollbackHistory: [...state.rollbackHistory, record],
    };

    this.write(nextState);
    return record;
  }

  private loadRecoveryMetrics(): readonly MetricPoint[] {
    if (!existsSync(this.recoveryMetricsFixturePath)) {
      return [];
    }
    return JSON.parse(
      readFileSync(this.recoveryMetricsFixturePath, "utf-8"),
    ) as readonly MetricPoint[];
  }

  private write(state: WorldState): void {
    mkdirSync(dirname(this.stateFilePath), { recursive: true });
    writeFileSync(
      this.stateFilePath,
      `${JSON.stringify(state, null, 2)}\n`,
      "utf-8",
    );
  }
}
