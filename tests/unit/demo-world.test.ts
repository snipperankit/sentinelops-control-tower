import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import {
  InvalidRollbackTargetError,
  UnknownDeploymentError,
  WorldNotSeededError,
  type DeploymentId,
} from "../../harness/demo/domain.js";
import { checkWorldHealth } from "../../harness/demo/health.js";
import {
  getDeploymentDiff,
  listDeployments,
  queryErrorRate,
  queryLatencyP95Ms,
} from "../../harness/demo/queries.js";
import { DemoWorldStore } from "../../harness/demo/store.js";

const FIXED_NOW = new Date("2026-01-01T01:30:00.000Z");

function createStore(): { store: DemoWorldStore; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), "sentinelops-demo-world-"));
  const store = new DemoWorldStore({
    stateFilePath: join(tempDir, "world.json"),
    clock: new FixedClock(FIXED_NOW),
  });
  return { store, tempDir };
}

describe("DemoWorldStore", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("reports unseeded before seeding and refuses to load", () => {
    const created = createStore();
    tempDir = created.tempDir;

    expect(created.store.isSeeded()).toBe(false);
    expect(() => created.store.load()).toThrow(WorldNotSeededError);
  });

  it("seeds the faulty payment-failure scenario matching PRODUCT_SPEC.md", () => {
    const created = createStore();
    tempDir = created.tempDir;
    const state = created.store.seed();

    expect(state.activeDeploymentId).toBe("4c21");
    expect(state.rolledBack).toBe(false);
    expect(created.store.getActiveDeployment().status).toBe("suspect");

    const errorRate = queryErrorRate(created.store);
    expect(errorRate.at(-1)?.value).toBeCloseTo(0.068);

    const latency = queryLatencyP95Ms(created.store);
    expect(latency.at(-1)?.value).toBe(1750);

    const diff = getDeploymentDiff(created.store, "4c21");
    expect(diff.previous?.id).toBe("4c20");
    expect(diff.checkoutTimeoutMsDelta).toBeLessThan(0);
  });

  it("keeps 4c18-4c20 healthy and unrelated services comparatively stable", () => {
    const created = createStore();
    tempDir = created.tempDir;
    created.store.seed();

    for (const id of ["4c18", "4c19", "4c20"] as const) {
      expect(created.store.getDeployment(id).status).toBe("healthy");
    }
    expect(listDeployments(created.store).map((d) => d.id)).toEqual([
      "4c18",
      "4c19",
      "4c20",
      "4c21",
    ]);

    for (const service of [
      "payments-gateway",
      "inventory",
      "shipping",
    ] as const) {
      const [before, after] = queryErrorRate(created.store, service);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(Math.abs((after?.value ?? 0) - (before?.value ?? 0))).toBeLessThan(
        0.005,
      );
    }
  });

  it("rolls back to the last known good deployment and records recovery metrics", () => {
    const created = createStore();
    tempDir = created.tempDir;
    created.store.seed();

    const record = created.store.rollbackTo("4c20");

    expect(record).toEqual({
      fromDeploymentId: "4c21",
      toDeploymentId: "4c20",
      requestedAt: FIXED_NOW.toISOString(),
    });

    const state = created.store.load();
    expect(state.activeDeploymentId).toBe("4c20");
    expect(state.rolledBack).toBe(true);
    expect(state.rollbackHistory).toEqual([record]);
    expect(created.store.getDeployment("4c21").status).toBe("rolled-back");

    expect(queryErrorRate(created.store).at(-1)?.value).toBeLessThan(0.03);
    expect(queryLatencyP95Ms(created.store).at(-1)?.value).toBeLessThan(900);
  });

  it("rejects rolling back to the already-active deployment", () => {
    const created = createStore();
    tempDir = created.tempDir;
    created.store.seed();

    expect(() => created.store.rollbackTo("4c21")).toThrow(
      InvalidRollbackTargetError,
    );
  });

  it("rejects rolling back to an unknown deployment", () => {
    const created = createStore();
    tempDir = created.tempDir;
    created.store.seed();

    // Simulates untrusted/tampered input reaching the store boundary.
    const unknownId = "9999" as unknown as DeploymentId;
    expect(() => created.store.rollbackTo(unknownId)).toThrow(
      UnknownDeploymentError,
    );
  });

  it("resets back to an unseeded state", () => {
    const created = createStore();
    tempDir = created.tempDir;
    created.store.seed();
    expect(created.store.isSeeded()).toBe(true);

    created.store.reset();
    expect(created.store.isSeeded()).toBe(false);
    expect(() => created.store.load()).toThrow(WorldNotSeededError);
  });

  it("reports health across unseeded, faulty, and rolled-back states", () => {
    const created = createStore();
    tempDir = created.tempDir;

    const unseededHealth = checkWorldHealth(created.store);
    expect(unseededHealth.find((r) => r.name === "world-seeded")?.ok).toBe(
      false,
    );

    created.store.seed();
    expect(checkWorldHealth(created.store).every((r) => r.ok)).toBe(true);

    created.store.rollbackTo("4c20");
    expect(checkWorldHealth(created.store).every((r) => r.ok)).toBe(true);
  });
});
