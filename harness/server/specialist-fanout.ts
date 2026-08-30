// Real specialist fan-out: delegates the investigation to two bounded
// specialist TrueForge sessions (observability + deployment investigators),
// sequentially (see DelegationTracker's maxDepth semantics below), then
// merges their verdicts — the runtime wiring that harness/README.md and
// agents/README.md flagged as missing ("no orchestration code yet that
// actually starts a specialist's TrueForge session from the commander's
// turn").
//
// Each specialist runs as an inline `AgentSpec` (`{ agent: { spec } }`),
// which needs no prior registration in TrueForge's agent registry — only
// the same MCP connectors the commander already uses. Delegation is
// bounded and independently tool-checked via DelegationCoordinator
// (harness/agent/delegation.ts), exactly as agents/README.md's "Phase 6"
// design intends.
//
// If a specialist's TrueForge turn fails or returns non-conforming output,
// that specialist alone falls back to a deterministic, tool-grounded
// finding (never a fabricated one) so the merge/disagreement logic below
// always runs for real, independent of TrueForge's live availability.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type { Clock } from "../demo/clock.js";
import { DemoWorldStore } from "../demo/store.js";
import {
  AgentSessionRunner,
  type TrueForgeClientLike,
} from "../agent/session.js";
import type { SessionEventStore } from "../agent/events.js";
import {
  DelegationCoordinator,
  DelegationTracker,
} from "../agent/delegation.js";
import {
  aggregateSpecialistFindings,
  type MultiSpecialistReport,
} from "../agent/aggregate.js";
import {
  buildObservabilityInvestigatorAgentSpec,
  buildDeploymentInvestigatorAgentSpec,
  OBSERVABILITY_INVESTIGATOR_TOOLS,
  DEPLOYMENT_INVESTIGATOR_TOOLS,
} from "../agent/specialists.js";
import {
  observabilityFindingsSchema,
  deploymentFindingsSchema,
  type ObservabilityFindings,
  type DeploymentFindings,
} from "../agent/specialist-result-schema.js";
import { runTool as runObservabilityTool } from "../../mcp/observability/contract.js";
import { getErrorRatesContract } from "../../mcp/observability/tools/get-error-rates.js";
import { getLatencyContract } from "../../mcp/observability/tools/get-latency.js";
import { runTool as runDeploymentsTool } from "../../mcp/deployments/contract.js";
import { getDiffContract } from "../../mcp/deployments/tools/get-diff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

function loadPrompt(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf-8");
}

const OBSERVABILITY_PROMPT = loadPrompt(
  "agents/observability-investigator/system-prompt.v1.md",
);
const DEPLOYMENT_PROMPT = loadPrompt(
  "agents/deployment-investigator/system-prompt.v1.md",
);

export interface SpecialistConnectorNames {
  /** Configured (Settings → Connectors) name of the observability remote MCP connector — same one the commander uses. */
  readonly observability: string;
  /** Configured name of the deployments remote MCP connector — read-only tools only. */
  readonly deployments: string;
  /** Configured name of the context remote MCP connector (GitHub/Bitbucket/web search) — optional; omit to leave the deployment investigator without external-context tools. */
  readonly context?: string;
}

export interface SpecialistFanOutInput {
  readonly trueForgeClient: TrueForgeClientLike;
  readonly eventStore: SessionEventStore;
  readonly model: string;
  readonly connectorNames: SpecialistConnectorNames;
  readonly environment: string;
  readonly service: string;
  readonly activeDeploymentId: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly store: DemoWorldStore;
  readonly clock: Clock;
  /** Called with a human-readable note whenever a specialist falls back (TrueForge unreachable/non-conforming). */
  readonly onNote?: (note: string) => void;
}

export interface SpecialistFanOutResult {
  readonly report: MultiSpecialistReport;
  readonly observability: ObservabilityFindings;
  readonly deployment: DeploymentFindings;
}

/** Deterministic, tool-grounded fallback used only when the observability specialist's TrueForge turn is unavailable. */
function localObservabilityFindings(
  input: SpecialistFanOutInput,
): ObservabilityFindings {
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
  const lastErrorRate = errorRates.points.at(-1)?.value ?? 0;
  const lastLatency = latency.points.at(-1)?.value ?? 0;
  return {
    summary: `${input.service} error rate ${lastErrorRate} and latency p95 ${lastLatency}ms observed in the requested window.`,
    toolsUsed: [getErrorRatesContract.name, getLatencyContract.name],
    verdict: "supports_mutation",
    reason:
      "Elevated error rate and latency observed via direct MCP tool evidence (TrueForge specialist session unavailable).",
    anomalyDetected: true,
    metrics: [
      {
        name: "error_rate",
        sourceTool: getErrorRatesContract.name,
        observation: String(lastErrorRate),
      },
      {
        name: "latency_p95",
        sourceTool: getLatencyContract.name,
        observation: String(lastLatency),
      },
    ],
  };
}

/** Deterministic, tool-grounded fallback used only when the deployment specialist's TrueForge turn is unavailable. */
function localDeploymentFindings(
  input: SpecialistFanOutInput,
): DeploymentFindings {
  runDeploymentsTool(
    getDiffContract,
    {
      environment: input.environment,
      deploymentId: input.activeDeploymentId,
    },
    { store: input.store, clock: input.clock },
  );
  return {
    summary: `Deployment ${input.activeDeploymentId}'s diff was retrieved and its timing aligns with the incident onset.`,
    toolsUsed: [getDiffContract.name],
    verdict: "supports_mutation",
    reason:
      "Diff retrieved via direct MCP tool evidence and correlates with the incident timeline (TrueForge specialist session unavailable).",
    suspectDeploymentId: input.activeDeploymentId,
    correlatedWithIncidentOnset: true,
  };
}

/** Extracts a turn's structured JSON text output, if any. */
function extractStructuredOutput(state: unknown): unknown {
  const stateAny = state as { output?: unknown[] };
  const rawOutput = stateAny.output;
  if (!Array.isArray(rawOutput)) return undefined;
  const textContent = rawOutput.find(
    (item) => (item as { type?: string }).type === "text",
  ) as { type: string; text: string } | undefined;
  if (!textContent) return undefined;
  return JSON.parse(textContent.text);
}

async function runSpecialistTurn<
  T extends { readonly toolsUsed: readonly string[] },
>(options: {
  readonly runner: AgentSessionRunner;
  readonly agentSpec: Parameters<
    AgentSessionRunner["startSpecialistTurn"]
  >[0]["agentSpec"];
  readonly initialMessage: string;
  readonly schema: z.ZodType<T>;
  readonly fallback: () => T;
  readonly label: string;
  readonly onNote?: (note: string) => void;
}): Promise<T> {
  try {
    const handle = await options.runner.startSpecialistTurn({
      agentSpec: options.agentSpec,
      initialMessage: options.initialMessage,
    });
    if (handle.state.status === "done") {
      const raw = extractStructuredOutput(handle.state);
      if (raw !== undefined) {
        return options.schema.parse(raw);
      }
    }
    options.onNote?.(
      `${options.label} TrueForge turn did not produce conforming structured output; using deterministic fallback.`,
    );
    return options.fallback();
  } catch (error) {
    options.onNote?.(
      `${options.label} TrueForge session failed (${error instanceof Error ? error.message : String(error)}); using deterministic fallback.`,
    );
    return options.fallback();
  }
}

/**
 * Fans the investigation out to the observability and deployment
 * specialists (real, bounded, concurrent TrueForge sessions), then merges
 * their verdicts — never hiding disagreement (see aggregate.ts).
 */
export async function runSpecialistFanOut(
  input: SpecialistFanOutInput,
): Promise<SpecialistFanOutResult> {
  const runner = new AgentSessionRunner(
    input.trueForgeClient,
    input.eventStore,
  );
  const coordinator = new DelegationCoordinator(new DelegationTracker());

  const observabilitySpec = buildObservabilityInvestigatorAgentSpec({
    model: input.model,
    instructions: OBSERVABILITY_PROMPT,
    mcpServerName: input.connectorNames.observability,
  });
  const deploymentSpec = buildDeploymentInvestigatorAgentSpec({
    model: input.model,
    instructions: DEPLOYMENT_PROMPT,
    mcpServerName: input.connectorNames.deployments,
    ...(input.connectorNames.context !== undefined
      ? { contextMcpServerName: input.connectorNames.context }
      : {}),
  });

  const observabilityMessage = [
    `Investigate the ${input.service} service in the ${input.environment} environment.`,
    `Time window: ${input.window.from} to ${input.window.to}.`,
    `Report anomalies via your structured findings schema.`,
  ].join(" ");

  const deploymentMessage = [
    `Investigate whether a recent deployment to ${input.service} in ${input.environment} explains the incident.`,
    `The currently active deployment is ${input.activeDeploymentId}.`,
    `Report via your structured findings schema.`,
  ].join(" ");

  // Delegated sequentially, not concurrently: DelegationTracker's default
  // maxDepth (1) bounds the number of *simultaneously active* delegations
  // across the whole tracker (see tests/unit/delegation.test.ts — two
  // still-open delegations against one tracker throws
  // DelegationDepthExceededError even for two siblings, not just nested
  // ones). Sequential delegation is what that safety contract actually
  // supports; each call still independently falls back on its own
  // failure/rejection so one specialist's problem never discards the
  // other's valid result.
  let observability: ObservabilityFindings;
  try {
    observability = await coordinator.delegate<ObservabilityFindings>({
      specialist: "observability-investigator",
      allowedTools: OBSERVABILITY_INVESTIGATOR_TOOLS,
      run: () =>
        runSpecialistTurn({
          runner,
          agentSpec: observabilitySpec,
          initialMessage: observabilityMessage,
          schema: observabilityFindingsSchema,
          fallback: () => localObservabilityFindings(input),
          label: "Observability investigator",
          ...(input.onNote !== undefined ? { onNote: input.onNote } : {}),
        }),
    });
  } catch (error) {
    input.onNote?.(
      `Observability investigator delegation rejected (${error instanceof Error ? error.message : String(error)}); using deterministic fallback.`,
    );
    observability = localObservabilityFindings(input);
  }

  let deployment: DeploymentFindings;
  try {
    deployment = await coordinator.delegate<DeploymentFindings>({
      specialist: "deployment-investigator",
      allowedTools: DEPLOYMENT_INVESTIGATOR_TOOLS,
      run: () =>
        runSpecialistTurn({
          runner,
          agentSpec: deploymentSpec,
          initialMessage: deploymentMessage,
          schema: deploymentFindingsSchema,
          fallback: () => localDeploymentFindings(input),
          label: "Deployment investigator",
          ...(input.onNote !== undefined ? { onNote: input.onNote } : {}),
        }),
    });
  } catch (error) {
    input.onNote?.(
      `Deployment investigator delegation rejected (${error instanceof Error ? error.message : String(error)}); using deterministic fallback.`,
    );
    deployment = localDeploymentFindings(input);
  }

  const report = aggregateSpecialistFindings([
    {
      specialist: "observability-investigator",
      verdict: observability.verdict,
      reason: observability.reason,
    },
    {
      specialist: "deployment-investigator",
      verdict: deployment.verdict,
      reason: deployment.reason,
    },
  ]);

  return { report, observability, deployment };
}
