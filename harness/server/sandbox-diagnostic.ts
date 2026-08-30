// Real sandbox diagnostic step: generates a small anomaly-detection script
// from live error-rate/latency evidence (fetched via the same read-only MCP
// tools used elsewhere) and executes it inside the isolated Docker sandbox
// (sandbox/runner.ts) — the runtime wiring flagged as missing ("generated
// code executes in TrueForge sandbox, not host" was never actually
// exercised: LiveIncidentSession only ever set a hardcoded placeholder
// status instead of calling runSandboxExecution()).
//
// Only the two numeric metric-point arrays are embedded into the generated
// script as literals; the sandbox itself never receives MCP credentials,
// store access, or any other host state (see AGENTS.md / sandbox
// instructions).
import { runTool as runObservabilityTool } from "../../mcp/observability/contract.js";
import { getErrorRatesContract } from "../../mcp/observability/tools/get-error-rates.js";
import { getLatencyContract } from "../../mcp/observability/tools/get-latency.js";
import { runSandboxExecution } from "../../sandbox/index.js";
import type { SandboxExecutionResult } from "../../sandbox/index.js";
import type { Clock } from "../demo/clock.js";
import type { DemoWorldStore } from "../demo/store.js";

interface MetricPoint {
  readonly timestamp: string;
  readonly value: number;
}

export interface SandboxDiagnosticInput {
  readonly store: DemoWorldStore;
  readonly clock: Clock;
  readonly service: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly onNote?: (note: string) => void;
}

export type SandboxDiagnosticStatus = "completed" | "blocked" | "error";

export interface SandboxDiagnosticResult {
  readonly status: SandboxDiagnosticStatus;
  readonly summary: string;
  readonly durationMs: number;
  readonly anomalyDetected: boolean | null;
}

/** Generated diagnostic code: compares a baseline window against the most recent points to flag anomalies. Data is embedded as literals, never read from the host. */
function buildDiagnosticScript(
  errorRatePoints: readonly MetricPoint[],
  latencyPoints: readonly MetricPoint[],
): string {
  return `
    const errorRatePoints = ${JSON.stringify(errorRatePoints)};
    const latencyPoints = ${JSON.stringify(latencyPoints)};

    function average(points) {
      if (points.length === 0) return 0;
      return points.reduce((sum, p) => sum + p.value, 0) / points.length;
    }

    function analyze(points, anomalyRatio) {
      if (points.length < 2) {
        const only = average(points);
        return { baselineAvg: only, recentAvg: only, ratio: 1, anomalous: false };
      }
      // Split into a non-overlapping earlier baseline and a later recent
      // window; with very few points (as in this demo world) recentCount
      // must stay small enough that baseline is never empty.
      const recentCount = Math.max(1, Math.min(3, Math.floor(points.length / 2)));
      const recent = points.slice(-recentCount);
      const baseline = points.slice(0, points.length - recentCount);
      const baselineAvg = average(baseline);
      const recentAvg = average(recent);
      const ratio = baselineAvg === 0 ? (recentAvg > 0 ? Infinity : 0) : recentAvg / baselineAvg;
      return {
        baselineAvg,
        recentAvg,
        ratio,
        anomalous: ratio >= anomalyRatio,
      };
    }

    const errorRate = analyze(errorRatePoints, 1.5);
    const latency = analyze(latencyPoints, 1.3);

    console.log(JSON.stringify({
      errorRate,
      latency,
      anomalyDetected: errorRate.anomalous || latency.anomalous,
    }));
  `;
}

function mapStatus(result: SandboxExecutionResult): SandboxDiagnosticStatus {
  switch (result.status) {
    case "completed":
      return "completed";
    case "resource_limit_exceeded":
    case "sandbox_unavailable":
      return "blocked";
    case "failed":
    case "timed_out":
      return "error";
  }
}

/**
 * Fetches live error-rate/latency evidence, generates a small anomaly-scoring
 * script from it, and runs that script inside the Docker sandbox. Never
 * throws: any failure (Docker unreachable, non-conforming output, etc.)
 * yields a `blocked`/`error` result rather than aborting the investigation.
 */
export async function runSandboxDiagnostic(
  input: SandboxDiagnosticInput,
): Promise<SandboxDiagnosticResult> {
  try {
    const errorRates = runObservabilityTool(
      getErrorRatesContract,
      { service: input.service, ...input.window, limit: 100 },
      { store: input.store, clock: input.clock },
    );
    const latency = runObservabilityTool(
      getLatencyContract,
      { service: input.service, ...input.window, limit: 100 },
      { store: input.store, clock: input.clock },
    );

    const result = await runSandboxExecution({
      code: buildDiagnosticScript(errorRates.points, latency.points),
      limits: { timeoutMs: 8_000 },
    });

    const status = mapStatus(result);
    if (status !== "completed") {
      input.onNote?.(
        `Sandbox diagnostic did not complete (status: ${result.status}); see sandbox panel for details.`,
      );
      return {
        status,
        summary:
          result.stderr.trim().length > 0
            ? result.stderr.trim().slice(0, 500)
            : `Sandbox execution status: ${result.status}.`,
        durationMs: result.durationMs,
        anomalyDetected: null,
      };
    }

    let anomalyDetected: boolean | null = null;
    try {
      const parsed = JSON.parse(result.stdout) as { anomalyDetected: boolean };
      anomalyDetected = parsed.anomalyDetected;
    } catch {
      input.onNote?.(
        "Sandbox diagnostic completed but produced non-JSON output; treating anomaly result as unknown.",
      );
    }

    return {
      status: "completed",
      summary:
        anomalyDetected === null
          ? "Sandbox diagnostic completed; output was not parseable."
          : anomalyDetected
            ? "Sandbox diagnostic flagged an anomaly in error rate or latency versus baseline."
            : "Sandbox diagnostic found no anomaly beyond baseline thresholds.",
      durationMs: result.durationMs,
      anomalyDetected,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.onNote?.(`Sandbox diagnostic failed to run: ${message}.`);
    return {
      status: "error",
      summary: `Sandbox diagnostic failed to run: ${message}`,
      durationMs: 0,
      anomalyDetected: null,
    };
  }
}
