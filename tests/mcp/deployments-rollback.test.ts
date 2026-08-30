// Contract tests for the deployments.rollback mutating MCP tool: success,
// wrong target, wrong environment, duplicate execution, stale current
// deployment, and malformed input (see .github/instructions/mcp.instructions.md,
// .github/instructions/policy.instructions.md, tests.instructions.md).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import { UnknownDeploymentError } from "../../harness/demo/domain.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import { InMemoryAuditSink } from "../../mcp/deployments/audit.js";
import { runTool } from "../../mcp/deployments/contract.js";
import {
  BackendUnavailableError,
  CurrentDeploymentMismatchError,
  DuplicateIdempotencyKeyError,
  EnvironmentMismatchError,
  InvalidArgumentsError,
  TargetNotAllowlistedError,
} from "../../mcp/deployments/errors.js";
import { InMemoryIdempotencyStore } from "../../mcp/deployments/idempotency.js";
import {
  rollbackContract,
  type RollbackToolDependencies,
} from "../../mcp/deployments/tools/rollback.js";

const ENVIRONMENT = "sentinelops-demo";
const WRONG_ENVIRONMENT = "staging";

function createSeededDeps(now: Date): {
  deps: RollbackToolDependencies;
  tempDir: string;
} {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-mcp-rollback-"));
  const clock = new FixedClock(now);
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock,
  });
  store.seed();
  return {
    deps: {
      store,
      clock,
      idempotencyStore: new InMemoryIdempotencyStore(),
      auditSink: new InMemoryAuditSink(),
    },
    tempDir,
  };
}

function createUnseededDeps(now: Date): {
  deps: RollbackToolDependencies;
  tempDir: string;
} {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-mcp-rollback-"));
  const clock = new FixedClock(now);
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock,
  });
  return {
    deps: {
      store,
      clock,
      idempotencyStore: new InMemoryIdempotencyStore(),
      auditSink: new InMemoryAuditSink(),
    },
    tempDir,
  };
}

describe("deployments.rollback", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("rolls back to a healthy, allowlisted target and returns a structured mutation result", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    const result = runTool(
      rollbackContract,
      {
        service: "checkout",
        environment: ENVIRONMENT,
        currentDeploymentId: "4c21",
        targetDeploymentId: "4c20",
        idempotencyKey: "req-001",
      },
      created.deps,
    );

    expect(result.mutated).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.fromDeploymentId).toBe("4c21");
    expect(result.toDeploymentId).toBe("4c20");
    expect(result.provenance.worldRolledBack).toBe(true);

    const world = created.deps.store.load();
    expect(world.activeDeploymentId).toBe("4c20");
    expect(world.rolledBack).toBe(true);
    expect(world.rollbackHistory).toHaveLength(1);
  });

  it("emits exactly one audit event on successful execution", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    runTool(
      rollbackContract,
      {
        service: "checkout",
        environment: ENVIRONMENT,
        currentDeploymentId: "4c21",
        targetDeploymentId: "4c20",
        idempotencyKey: "req-002",
      },
      created.deps,
    );

    const auditSink = created.deps.auditSink as InMemoryAuditSink;
    expect(auditSink.list()).toHaveLength(1);
    expect(auditSink.list()[0]).toMatchObject({
      type: "deployments.rollback.invoked",
      outcome: "executed",
      currentDeploymentId: "4c21",
      targetDeploymentId: "4c20",
    });
  });

  it("rejects a target deployment that is not healthy/allowlisted (wrong target)", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c21",
          idempotencyKey: "req-003",
        },
        created.deps,
      ),
    ).toThrow(TargetNotAllowlistedError);

    expect(created.deps.store.load().activeDeploymentId).toBe("4c21");
  });

  it("rejects an unknown target deployment id", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c99",
          idempotencyKey: "req-004",
        },
        created.deps,
      ),
    ).toThrow(UnknownDeploymentError);
  });

  it("rejects a request scoped to the wrong environment", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: WRONG_ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c20",
          idempotencyKey: "req-005",
        },
        created.deps,
      ),
    ).toThrow(EnvironmentMismatchError);

    expect(created.deps.store.load().activeDeploymentId).toBe("4c21");
  });

  it("rejects a stale current deployment that no longer matches the active deployment", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c20",
          targetDeploymentId: "4c19",
          idempotencyKey: "req-006",
        },
        created.deps,
      ),
    ).toThrow(CurrentDeploymentMismatchError);

    expect(created.deps.store.load().activeDeploymentId).toBe("4c21");
  });

  it("rejects an unknown current deployment id", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c99",
          targetDeploymentId: "4c20",
          idempotencyKey: "req-007",
        },
        created.deps,
      ),
    ).toThrow(UnknownDeploymentError);
  });

  it("replays the cached result for a duplicate call with the same idempotency key and arguments, without mutating again", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    const args = {
      service: "checkout" as const,
      environment: ENVIRONMENT,
      currentDeploymentId: "4c21" as const,
      targetDeploymentId: "4c20" as const,
      idempotencyKey: "req-008",
    };

    const first = runTool(rollbackContract, args, created.deps);
    const second = runTool(rollbackContract, args, created.deps);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.fromDeploymentId).toBe(first.fromDeploymentId);
    expect(second.toDeploymentId).toBe(first.toDeploymentId);
    expect(second.requestedAt).toBe(first.requestedAt);

    expect(created.deps.store.load().rollbackHistory).toHaveLength(1);

    const auditSink = created.deps.auditSink as InMemoryAuditSink;
    expect(auditSink.list().map((event) => event.outcome)).toEqual([
      "executed",
      "duplicate",
    ]);
  });

  it("rejects reuse of an idempotency key with different arguments", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    runTool(
      rollbackContract,
      {
        service: "checkout",
        environment: ENVIRONMENT,
        currentDeploymentId: "4c21",
        targetDeploymentId: "4c20",
        idempotencyKey: "req-009",
      },
      created.deps,
    );

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c19",
          idempotencyKey: "req-009",
        },
        created.deps,
      ),
    ).toThrow(DuplicateIdempotencyKeyError);
  });

  it("rejects malformed input", () => {
    const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "billing",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c20",
          idempotencyKey: "req-010",
        },
        created.deps,
      ),
    ).toThrow(InvalidArgumentsError);

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "not-a-deployment-id",
          targetDeploymentId: "4c20",
          idempotencyKey: "req-011",
        },
        created.deps,
      ),
    ).toThrow(InvalidArgumentsError);

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c20",
          idempotencyKey: "",
        },
        created.deps,
      ),
    ).toThrow(InvalidArgumentsError);
  });

  it("fails closed when the demo world is not seeded", () => {
    const created = createUnseededDeps(new Date("2026-01-01T01:05:00.000Z"));
    tempDir = created.tempDir;

    expect(() =>
      runTool(
        rollbackContract,
        {
          service: "checkout",
          environment: ENVIRONMENT,
          currentDeploymentId: "4c21",
          targetDeploymentId: "4c20",
          idempotencyKey: "req-012",
        },
        created.deps,
      ),
    ).toThrow(BackendUnavailableError);
  });
});
