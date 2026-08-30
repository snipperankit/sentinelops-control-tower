// Unit tests for runSandboxDiagnostic (harness/server/sandbox-diagnostic.ts):
// fetches real error-rate/latency evidence and runs a generated
// anomaly-detection script inside the real Docker sandbox. These tests
// exercise a real container (see tests/sandbox/isolation.test.ts for the
// established pattern) — no host secrets or state ever reach the script.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import { runSandboxDiagnostic } from "../../harness/server/sandbox-diagnostic.js";

const FIXED_NOW = new Date("2026-01-01T01:00:00.000Z");
const WINDOW = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-01T02:00:00.000Z",
} as const;

describe("runSandboxDiagnostic", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("runs the generated anomaly-detection script inside the real sandbox and reports a result", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-sandbox-diag-"));
    const store = new DemoWorldStore({
      stateFilePath: join(tempDir, "world.json"),
      clock: new FixedClock(FIXED_NOW),
    });
    store.reset();
    store.seed();

    const notes: string[] = [];
    const result = await runSandboxDiagnostic({
      store,
      clock: new FixedClock(FIXED_NOW),
      service: "checkout",
      window: WINDOW,
      onNote: (note) => notes.push(note),
    });

    expect(result.status).toBe("completed");
    expect(typeof result.anomalyDetected).toBe("boolean");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
  }, 20_000);

  it("flags a real anomaly: seeded checkout error-rate/latency jump between the two windowed points", async () => {
    // Regression test: with only two metric points (as in this demo
    // world), a naive "last N vs rest" baseline/recent split can degenerate
    // to comparing the same points against themselves (ratio 1, never
    // anomalous) and silently mask a genuine 3x error-rate / 2x latency
    // jump. This must never happen again.
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-sandbox-diag-"));
    const store = new DemoWorldStore({
      stateFilePath: join(tempDir, "world.json"),
      clock: new FixedClock(FIXED_NOW),
    });
    store.reset();
    store.seed();

    const result = await runSandboxDiagnostic({
      store,
      clock: new FixedClock(FIXED_NOW),
      service: "checkout",
      window: WINDOW,
    });

    expect(result.status).toBe("completed");
    expect(result.anomalyDetected).toBe(true);
  }, 20_000);
});
