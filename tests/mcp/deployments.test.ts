// Contract tests for the deployment MCP tools: valid, invalid, unknown
// deployment, wrong environment, stale metadata, unavailable, and malformed
// response scenarios (see .github/instructions/mcp.instructions.md and
// tests.instructions.md).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FixedClock } from "../../harness/demo/clock.js";
import { UnknownDeploymentError } from "../../harness/demo/domain.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import {
  runTool,
  type ToolContract,
  type ToolDependencies,
} from "../../mcp/deployments/contract.js";
import {
  BackendUnavailableError,
  EnvironmentMismatchError,
  InvalidArgumentsError,
} from "../../mcp/deployments/errors.js";
import { getDiffContract } from "../../mcp/deployments/tools/get-diff.js";
import { getHealthContract } from "../../mcp/deployments/tools/get-health.js";
import { getRollbackPrerequisitesContract } from "../../mcp/deployments/tools/get-rollback-prerequisites.js";
import { listRecentContract } from "../../mcp/deployments/tools/list-recent.js";

const ENVIRONMENT = "sentinelops-demo";
const WRONG_ENVIRONMENT = "staging";

function createSeededDeps(now: Date): {
  deps: ToolDependencies;
  tempDir: string;
} {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-mcp-deployments-"));
  const clock = new FixedClock(now);
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock,
  });
  store.seed();
  return { deps: { store, clock }, tempDir };
}

function createUnseededDeps(now: Date): {
  deps: ToolDependencies;
  tempDir: string;
} {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-mcp-deployments-"));
  const clock = new FixedClock(now);
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock,
  });
  return { deps: { store, clock }, tempDir };
}

describe("deployment MCP tools", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  describe("deployments.list_recent", () => {
    it("returns recent deployments scoped to the session environment, most recent first", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        listRecentContract,
        { environment: ENVIRONMENT, limit: 10 },
        created.deps,
      );

      expect(result.deployments.map((d) => d.id)).toEqual([
        "4c21",
        "4c20",
        "4c19",
        "4c18",
      ]);
      expect(result.deployments[0]?.isActive).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.omittedCount).toBe(0);
      expect(result.provenance.environment).toBe(ENVIRONMENT);
      expect(result.provenance.worldRolledBack).toBe(false);
    });

    it("truncates to the requested limit and reports the omitted count", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        listRecentContract,
        { environment: ENVIRONMENT, limit: 2 },
        created.deps,
      );

      expect(result.deployments.map((d) => d.id)).toEqual(["4c21", "4c20"]);
      expect(result.truncated).toBe(true);
      expect(result.omittedCount).toBe(2);
    });

    it("rejects a request scoped to the wrong environment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          listRecentContract,
          { environment: WRONG_ENVIRONMENT, limit: 10 },
          created.deps,
        ),
      ).toThrow(EnvironmentMismatchError);
    });

    it("rejects malformed arguments", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          listRecentContract,
          { environment: "", limit: 10 },
          created.deps,
        ),
      ).toThrow(InvalidArgumentsError);

      expect(() =>
        runTool(
          listRecentContract,
          { environment: ENVIRONMENT, limit: -1 },
          created.deps,
        ),
      ).toThrow(InvalidArgumentsError);
    });

    it("fails closed when the demo world is not seeded", () => {
      const created = createUnseededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          listRecentContract,
          { environment: ENVIRONMENT, limit: 10 },
          created.deps,
        ),
      ).toThrow(BackendUnavailableError);
    });
  });

  describe("deployments.get_diff", () => {
    it("returns a deployment and its diff against the previous deployment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        getDiffContract,
        { environment: ENVIRONMENT, deploymentId: "4c21" },
        created.deps,
      );

      expect(result.deployment.id).toBe("4c21");
      expect(result.previous?.id).toBe("4c20");
      expect(result.checkoutTimeoutMsDelta).toBe(800 - 3000);
      expect(result.provenance.environment).toBe(ENVIRONMENT);
    });

    it("omits previous/delta for the first deployment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        getDiffContract,
        { environment: ENVIRONMENT, deploymentId: "4c18" },
        created.deps,
      );

      expect(result.previous).toBeUndefined();
      expect(result.checkoutTimeoutMsDelta).toBeUndefined();
    });

    it("rejects an unknown deployment id", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getDiffContract,
          { environment: ENVIRONMENT, deploymentId: "4c99" },
          created.deps,
        ),
      ).toThrow(UnknownDeploymentError);
    });

    it("rejects a malformed deployment identifier", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getDiffContract,
          { environment: ENVIRONMENT, deploymentId: "not-a-deployment-id" },
          created.deps,
        ),
      ).toThrow(InvalidArgumentsError);
    });

    it("rejects a request scoped to the wrong environment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getDiffContract,
          { environment: WRONG_ENVIRONMENT, deploymentId: "4c21" },
          created.deps,
        ),
      ).toThrow(EnvironmentMismatchError);
    });

    it("fails closed when the demo world is not seeded", () => {
      const created = createUnseededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getDiffContract,
          { environment: ENVIRONMENT, deploymentId: "4c21" },
          created.deps,
        ),
      ).toThrow(BackendUnavailableError);
    });
  });

  describe("deployments.get_health", () => {
    it("returns fresh health metadata shortly after deployment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        getHealthContract,
        { environment: ENVIRONMENT, deploymentId: "4c21" },
        created.deps,
      );

      expect(result.status).toBe("suspect");
      expect(result.isActive).toBe(true);
      expect(result.stale).toBe(false);
      expect(result.ageMs).toBe(5 * 60 * 1000);
    });

    it("reports stale metadata long after deployment", () => {
      const created = createSeededDeps(new Date("2026-01-02T01:00:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        getHealthContract,
        { environment: ENVIRONMENT, deploymentId: "4c21" },
        created.deps,
      );

      expect(result.stale).toBe(true);
    });

    it("rejects an unknown deployment id", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getHealthContract,
          { environment: ENVIRONMENT, deploymentId: "4c99" },
          created.deps,
        ),
      ).toThrow(UnknownDeploymentError);
    });

    it("rejects a request scoped to the wrong environment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getHealthContract,
          { environment: WRONG_ENVIRONMENT, deploymentId: "4c21" },
          created.deps,
        ),
      ).toThrow(EnvironmentMismatchError);
    });

    it("fails closed when the demo world is not seeded", () => {
      const created = createUnseededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getHealthContract,
          { environment: ENVIRONMENT, deploymentId: "4c21" },
          created.deps,
        ),
      ).toThrow(BackendUnavailableError);
    });
  });

  describe("deployments.get_rollback_prerequisites", () => {
    it("reports a healthy, non-active target as eligible", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        getRollbackPrerequisitesContract,
        { environment: ENVIRONMENT, targetDeploymentId: "4c20" },
        created.deps,
      );

      expect(result.eligible).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.activeDeploymentId).toBe("4c21");
    });

    it("reports the currently active deployment as ineligible", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const result = runTool(
        getRollbackPrerequisitesContract,
        { environment: ENVIRONMENT, targetDeploymentId: "4c21" },
        created.deps,
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("target deployment is already active");
    });

    it("does not mutate the demo world", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      runTool(
        getRollbackPrerequisitesContract,
        { environment: ENVIRONMENT, targetDeploymentId: "4c20" },
        created.deps,
      );

      expect(created.deps.store.load().activeDeploymentId).toBe("4c21");
      expect(created.deps.store.load().rolledBack).toBe(false);
    });

    it("rejects an unknown target deployment id", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getRollbackPrerequisitesContract,
          { environment: ENVIRONMENT, targetDeploymentId: "4c99" },
          created.deps,
        ),
      ).toThrow(UnknownDeploymentError);
    });

    it("rejects a request scoped to the wrong environment", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getRollbackPrerequisitesContract,
          { environment: WRONG_ENVIRONMENT, targetDeploymentId: "4c20" },
          created.deps,
        ),
      ).toThrow(EnvironmentMismatchError);
    });

    it("fails closed when the demo world is not seeded", () => {
      const created = createUnseededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      expect(() =>
        runTool(
          getRollbackPrerequisitesContract,
          { environment: ENVIRONMENT, targetDeploymentId: "4c20" },
          created.deps,
        ),
      ).toThrow(BackendUnavailableError);
    });
  });

  describe("malformed tool responses", () => {
    it("throws when a tool produces output that violates its own output schema", () => {
      const created = createSeededDeps(new Date("2026-01-01T01:05:00.000Z"));
      tempDir = created.tempDir;

      const brokenContract: ToolContract<
        { environment: string },
        { ok: boolean }
      > = {
        name: "deployments.__broken_for_test__",
        description: "test-only contract that violates its own output schema",
        inputSchema: z.object({ environment: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        risk: "read-only",
        requiredScope: [],
        timeoutMs: 100,
        maxResultItems: 1,
        auditEventType: "test.invoked",
        execute: () => ({ ok: "not-a-boolean" }) as unknown as { ok: boolean },
      };

      expect(() =>
        runTool(brokenContract, { environment: ENVIRONMENT }, created.deps),
      ).toThrow(/violates its own output schema/);
    });
  });
});
