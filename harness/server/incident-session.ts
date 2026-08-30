// LiveIncidentSession: the real (non-scripted) incident session state
// machine backing the session API, now powered by TrueForge.
//
// Architecture:
//  - INVESTIGATION: Delegated to TrueForge's agent session API. The
//    commander agent (registered in TrueForge) drives the investigation
//    using Gemini Flash, calling real MCP tools via TrueForge connectors.
//    TrueForge's sandbox executes generated diagnostics.
//  - APPROVAL: Our policy gateway (policy/gateway.ts) enforces the full
//    10-step authorization pipeline. TrueForge never authorizes mutations.
//  - MUTATION: The `deployments.rollback` tool runs through our harness,
//    applied to the file-backed demo world, only after policy approval.
//  - VERIFICATION: Re-queries the real post-rollback demo world state via
//    in-process MCP contracts (fast, deterministic, no LLM needed).
//  - AUDIT: Evidence, hypotheses, actions, and approvals form a
//    hash-linked tamper-evident AuditChain (harness/audit).
//
// TrueForge provides: model orchestration, tool discovery, sandbox,
// session persistence, structured output, and context management.
// We provide: policy enforcement, approval workflow, mutation control,
// verification, and the incident cockpit UI.
import { randomUUID } from "node:crypto";
import type { Clock } from "../demo/clock.js";
import { SystemClock } from "../demo/clock.js";
import { DemoWorldStore } from "../demo/store.js";
import type { DeploymentId, ServiceName, WorldState } from "../demo/domain.js";
import {
  EvidenceGraph,
  AuditChain,
  type EvidenceInput,
} from "../audit/index.js";
import { scanForPromptInjection } from "../agent/prompt-injection-scan.js";
import { authorize, type PolicyGatewayDeps } from "../../policy/gateway.js";
import {
  InMemoryApprovalStore,
  canonicalizeArguments,
  hashArguments,
  DEFAULT_APPROVAL_TTL_MS,
} from "../../policy/approval.js";
import { KillSwitch } from "../../policy/kill-switch.js";
import {
  InMemoryPolicyAuditSink,
  type ApprovalGrant,
} from "../../policy/types.js";
import type { SessionScope } from "../../policy/scope.js";
import {
  ApprovalArgumentMismatchError,
  ApprovalExpiredError,
  ApprovalAlreadyUsedError,
  PolicyServiceUnavailableError,
} from "../../policy/errors.js";
import { runTool as runObservabilityTool } from "../../mcp/observability/contract.js";
import { getErrorRatesContract } from "../../mcp/observability/tools/get-error-rates.js";
import { getLatencyContract } from "../../mcp/observability/tools/get-latency.js";
import { runTool as runDeploymentsTool } from "../../mcp/deployments/contract.js";
import { listRecentContract } from "../../mcp/deployments/tools/list-recent.js";
import { getDiffContract } from "../../mcp/deployments/tools/get-diff.js";
import {
  rollbackContract,
  type RollbackInput,
  type RollbackOutput,
} from "../../mcp/deployments/tools/rollback.js";
import { InMemoryIdempotencyStore } from "../../mcp/deployments/idempotency.js";
import { InMemoryAuditSink as DeploymentsAuditSink } from "../../mcp/deployments/audit.js";
import { runTool as runIncidentsTool } from "../../mcp/incidents/contract.js";
import { getRunbookContract } from "../../mcp/incidents/tools/get-runbook.js";
import { createTrueForgeClient } from "../agent/client.js";
import {
  AgentSessionRunner,
  type TrueForgeClientLike,
} from "../agent/session.js";
import { InMemorySessionEventStore } from "../agent/events.js";
import { COMMANDER_AGENT_NAME } from "../agent/spec.js";
import { runSpecialistFanOut } from "./specialist-fanout.js";
import { runSandboxDiagnostic } from "./sandbox-diagnostic.js";
import {
  investigationResultSchema,
  type InvestigationResult,
} from "../agent/result-schema.js";
import type {
  ApprovalCardViewWire,
  ApprovalCardViewWire as ApprovalStatusHolder,
  AuditTrailEntryViewWire,
  EvidenceViewWire,
  HypothesisViewWire,
  SandboxStatusViewWire,
  SessionViewModelWire,
  SpecialistFindingViewWire,
  TimelineEventViewWire,
  VerificationResultViewWire,
  WireSessionState,
} from "./contract.js";

export class InvalidSessionTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSessionTransitionError";
  }
}

const SERVICE: ServiceName = "checkout";
// The demo world's fixture data (harness/demo/fixtures/world.json,
// recovery-metrics.json) is anchored to a fixed fictional epoch
// (2026-01-01T00:xx-01:xx), independent of wall-clock time. Observability
// tools cap the queryable window at 6 hours (see
// mcp/observability/schemas.ts MAX_TIME_WINDOW_MS), so this window is
// deliberately scoped to that fixed epoch rather than "now" — it comfortably
// covers both the seeded pre-rollback metrics and the post-rollback
// recovery metrics appended by DemoWorldStore.rollbackTo().
const METRICS_WINDOW = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-01T02:00:00.000Z",
} as const;

interface PendingApproval extends ApprovalCardViewWire {
  readonly rollbackArgs: RollbackInput;
}

function mapPolicyErrorToApprovalStatus(
  error: unknown,
): ApprovalStatusHolder["status"] {
  if (error instanceof ApprovalExpiredError) return "expired";
  if (error instanceof ApprovalArgumentMismatchError)
    return "argument_mismatch";
  if (error instanceof ApprovalAlreadyUsedError) return "consumed";
  if (error instanceof PolicyServiceUnavailableError)
    return "policy_unavailable";
  return "rejected";
}

function pickRollbackTarget(
  world: WorldState,
  activeId: DeploymentId,
): DeploymentId {
  const sorted = [...world.deployments].sort((a, b) =>
    a.deployedAt.localeCompare(b.deployedAt),
  );
  const activeIndex = sorted.findIndex((d) => d.id === activeId);
  for (let i = activeIndex - 1; i >= 0; i -= 1) {
    const candidate = sorted[i];
    if (candidate && candidate.status !== "rolled-back") {
      return candidate.id;
    }
  }
  throw new Error(`No eligible rollback target found before ${activeId}`);
}

export interface LiveIncidentSessionOptions {
  readonly store?: DemoWorldStore;
  readonly clock?: Clock;
  readonly approvalStore?: import("../../policy/approval.js").ApprovalStore;
  readonly policyAuditSink?: import("../../policy/types.js").PolicyAuditSink;
  /** Inject a TrueForge client for testing; defaults to createTrueForgeClient(). */
  readonly trueForgeClient?: TrueForgeClientLike;
  /** Commander agent name registered in TrueForge. Default: COMMANDER_AGENT_NAME. */
  readonly agentName?: string;
}

/**
 * A single real incident investigation/approval/mutation/verification
 * session. One instance per incident; the session API server keeps
 * these in an in-memory registry (see http.ts).
 */
export class LiveIncidentSession {
  readonly sessionId: string;
  private readonly store: DemoWorldStore;
  private readonly clock: Clock;
  private readonly evidenceGraph = new EvidenceGraph();
  private readonly auditChain = new AuditChain();
  private approvalStore: import("../../policy/approval.js").ApprovalStore;
  private _rawPolicyAuditSink: import("../../policy/types.js").PolicyAuditSink;
  private policyAuditSink: import("../../policy/types.js").PolicyAuditSink;
  private readonly killSwitch: KillSwitch;
  private readonly idempotencyStore = new InMemoryIdempotencyStore();
  private readonly deploymentsAuditSink = new DeploymentsAuditSink();
  private readonly subscribers = new Set<
    (view: SessionViewModelWire) => void
  >();
  private readonly trueForgeClient: TrueForgeClientLike;
  private readonly agentSessionRunner: AgentSessionRunner;
  private readonly agentName: string;
  private readonly eventStore = new InMemorySessionEventStore();

  private state: WireSessionState = "investigating";
  private round = 1;
  private incidentTitle = `Investigating ${SERVICE} service incident`;
  private incidentOpenedAt: string;
  private timeline: TimelineEventViewWire[] = [];
  private hypotheses: HypothesisViewWire[] = [];
  private specialistFindings: SpecialistFindingViewWire[] = [];
  private sandbox: SandboxStatusViewWire = {
    status: "idle",
    network: "disabled",
    filesystem: "workspace-only",
  };
  private confidence = {
    confidencePercent: 0,
    uncertaintyFactors: [] as string[],
  };
  private pendingApproval: PendingApproval | null = null;
  private verification: VerificationResultViewWire | null = null;
  private environment = "sentinelops-demo";

  private constructor(options: LiveIncidentSessionOptions) {
    this.sessionId = randomUUID();
    this.store = options.store ?? new DemoWorldStore();
    this.clock = options.clock ?? new SystemClock();
    this.incidentOpenedAt = this.clock.now().toISOString();
    const sessionScope: SessionScope = {
      sessionId: this.sessionId,
      environment: this.environment,
    };
    this.sessionScope = sessionScope;

    // Allow injection of approval store and policy audit sink so approvals
    // created in the session can persist when the server shares a
    // FileApprovalStore. Defaults remain in-memory stores for tests.
    this.approvalStore = options.approvalStore ?? new InMemoryApprovalStore();

    // Underlying sink (in-memory by default) that we forward to and also
    // mirror into the session AuditChain for UI visibility.
    this._rawPolicyAuditSink =
      options.policyAuditSink ?? new InMemoryPolicyAuditSink();
    this.policyAuditSink = {
      record: (event: import("../../policy/types.js").PolicyAuditEvent) => {
        try {
          this._rawPolicyAuditSink.record(event);
        } catch {
          // best-effort
        }
        try {
          this.auditChain.append({
            type: event.type ?? "policy.event",
            sessionId: this.sessionId,
            payload: event as unknown as Record<string, unknown>,
          });
        } catch {
          // swallow
        }
      },
    };

    this.killSwitch = new KillSwitch(this.clock, this.policyAuditSink);

    this.trueForgeClient =
      options.trueForgeClient ??
      (createTrueForgeClient() as unknown as TrueForgeClientLike);
    this.agentName = options.agentName ?? COMMANDER_AGENT_NAME;
    this.agentSessionRunner = new AgentSessionRunner(
      this.trueForgeClient,
      this.eventStore,
    );
  }

  private readonly sessionScope: SessionScope;

  /**
   * Expose policy gateway dependencies scoped to this session so external
   * callers (the session API server) can authorize adapter calls against
   * the same approval store and audit sink that the session uses.
   */
  getPolicyDeps(): PolicyGatewayDeps {
    return {
      clock: this.clock,
      approvalStore: this.approvalStore,
      auditSink: this.policyAuditSink,
      killSwitch: this.killSwitch,
      sessionScope: this.sessionScope,
    };
  }
  /** Creates a fresh session with a freshly (re)seeded deterministic demo world, and starts the first investigation round in the background. */
  static create(options: LiveIncidentSessionOptions = {}): LiveIncidentSession {
    const session = new LiveIncidentSession(options);
    session.store.reset();
    session.store.seed();
    void session.runInvestigation();
    return session;
  }

  subscribe(listener: (view: SessionViewModelWire) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  private notify(): void {
    const view = this.getViewModel();
    for (const listener of this.subscribers) {
      listener(view);
    }
  }

  private pushTimeline(
    kind: TimelineEventViewWire["kind"],
    summary: string,
    toolName?: string,
    trust?: "trusted" | "untrusted",
  ): void {
    this.timeline = [
      ...this.timeline,
      {
        id: randomUUID(),
        occurredAt: this.clock.now().toISOString(),
        kind,
        summary,
        ...(toolName !== undefined ? { toolName } : {}),
        ...(trust !== undefined ? { trust } : {}),
      },
    ];
  }

  private recordToolCall<Output>(
    toolName: string,
    input: unknown,
    trust: "trusted" | "untrusted",
    interpretation: string,
    run: () => Output,
  ): { output: Output; evidenceId: string } {
    const output = run();
    const evidence = this.evidenceGraph.recordEvidence({
      sessionId: this.sessionId,
      sourceTool: toolName,
      query: JSON.stringify(input),
      trust,
      interpretation,
      result: output,
    } satisfies EvidenceInput);
    this.pushTimeline("tool_call", `Called ${toolName}`, toolName, trust);
    this.pushTimeline("tool_result", interpretation, toolName, trust);
    this.auditChain.append({
      type: "tool.invoked",
      sessionId: this.sessionId,
      payload: { toolName, evidenceId: evidence.id },
    });
    return { output, evidenceId: evidence.id };
  }

  private async runInvestigation(): Promise<void> {
    this.state = "investigating";
    this.pendingApproval = null;
    this.verification = null;
    this.pushTimeline("note", `Investigation round ${this.round} started.`);
    this.notify();

    const world = this.store.load();
    this.environment = world.environment;
    const activeId = world.activeDeploymentId;

    const incidentPrompt = [
      `Investigate the payment-failures alert in the ${this.environment} environment.`,
      `The checkout service is reporting elevated error rates and latency.`,
      `The currently active deployment is ${activeId}.`,
      `Determine the root cause, correlate with recent deployments, and recommend whether a rollback is warranted.`,
      `Use the time window from 2026-01-01T00:00:00.000Z to 2026-01-01T02:00:00.000Z for metric queries.`,
    ].join(" ");

    this.pushTimeline(
      "note",
      "Delegating investigation to TrueForge commander agent (real LLM + MCP tools).",
    );
    this.notify();

    let investigationResult: InvestigationResult | null = null;

    try {
      const handle = await this.agentSessionRunner.startInvestigation({
        agentName: this.agentName,
        initialMessage: incidentPrompt,
      });

      this.pushTimeline(
        "note",
        `TrueForge session ${handle.sessionId} turn ${handle.turnId} completed (status: ${handle.state.status}).`,
      );

      // Extract structured output from the turn
      if (handle.state.status === "done") {
        const stateAny = handle.state as unknown as { output?: unknown[] };
        const rawOutput = stateAny.output;
        if (Array.isArray(rawOutput)) {
          const textContent = rawOutput.find(
            (item: unknown) => (item as { type?: string }).type === "text",
          ) as { type: string; text: string } | undefined;
          if (textContent && "text" in textContent) {
            try {
              const parsed = JSON.parse(textContent.text);
              investigationResult = investigationResultSchema.parse(parsed);
            } catch {
              // Model returned non-conforming output; fall through to fallback
              this.pushTimeline(
                "note",
                "TrueForge agent output did not conform to the investigation schema; using evidence-based fallback.",
              );
            }
          }
        }
      }

      // Record tool calls from the event store into our timeline + evidence
      const events = this.eventStore.listForTurn(
        handle.sessionId,
        handle.turnId,
      );
      for (const stored of events) {
        const evtType = (stored.event as { type: string }).type;
        if (evtType === "tool.response") {
          const toolName =
            (stored.event as unknown as { toolName?: string }).toolName ??
            "unknown";
          this.pushTimeline(
            "tool_call",
            `Called ${toolName}`,
            toolName,
            "trusted",
          );
          this.auditChain.append({
            type: "tool.invoked",
            sessionId: this.sessionId,
            payload: { toolName, trueForgeSessionId: handle.sessionId },
          });
          this.pushTimeline(
            "tool_result",
            `Result from ${toolName}`,
            toolName,
            "trusted",
          );
        }
      }

      this.auditChain.append({
        type: "trueforge.investigation.completed",
        sessionId: this.sessionId,
        payload: {
          trueForgeSessionId: handle.sessionId,
          turnId: handle.turnId,
          status: handle.state.status,
        },
      });
    } catch (error) {
      this.pushTimeline(
        "note",
        `TrueForge investigation failed: ${error instanceof Error ? error.message : String(error)}. Falling back to direct MCP investigation.`,
      );
      // Fall back to local evidence gathering
      investigationResult = await this.runLocalInvestigation(world, activeId);
    }

    // If TrueForge didn't produce a result, do local investigation
    if (!investigationResult) {
      investigationResult = await this.runLocalInvestigation(world, activeId);
    }

    // Fan out to the bounded observability + deployment specialists (real,
    // sequential, delegation-tracked TrueForge sessions; falls back per
    // specialist to deterministic tool-grounded findings if TrueForge is
    // unreachable) and merge their verdicts, never hiding disagreement.
    await this.runSpecialistFanOutStep(world, activeId);

    // Run a real, generated anomaly-detection script inside the isolated
    // Docker sandbox (never on the host) over the live metric evidence.
    await this.runSandboxDiagnosticStep();

    // Build the approval request from investigation results
    await this.buildApprovalFromResult(investigationResult, world, activeId);
  }

  /** Fallback: gather evidence directly via in-process MCP tool calls (no LLM). */
  private async runLocalInvestigation(
    world: WorldState,
    activeId: DeploymentId,
  ): Promise<InvestigationResult> {
    const recent = this.recordToolCall(
      listRecentContract.name,
      { environment: this.environment, limit: 20 },
      "trusted",
      "Listed recent deployments to establish investigation scope.",
      () =>
        runDeploymentsTool(
          listRecentContract,
          { environment: this.environment, limit: 20 },
          { store: this.store, clock: this.clock },
        ),
    );

    const diff = this.recordToolCall(
      getDiffContract.name,
      { environment: this.environment, deploymentId: activeId },
      "trusted",
      `Retrieved the diff for the currently active deployment ${activeId}.`,
      () =>
        runDeploymentsTool(
          getDiffContract,
          { environment: this.environment, deploymentId: activeId },
          { store: this.store, clock: this.clock },
        ),
    );

    const errorRates = this.recordToolCall(
      getErrorRatesContract.name,
      { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
      "trusted",
      `Retrieved ${SERVICE} error-rate history.`,
      () =>
        runObservabilityTool(
          getErrorRatesContract,
          { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
          { store: this.store, clock: this.clock },
        ),
    );

    const latency = this.recordToolCall(
      getLatencyContract.name,
      { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
      "trusted",
      `Retrieved ${SERVICE} latency (p95) history.`,
      () =>
        runObservabilityTool(
          getLatencyContract,
          { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
          { store: this.store, clock: this.clock },
        ),
    );

    const runbook = this.recordToolCall(
      getRunbookContract.name,
      { environment: this.environment, service: SERVICE },
      "untrusted",
      `Retrieved the rollback runbook for ${SERVICE} (free-form text; treated as untrusted).`,
      () =>
        runIncidentsTool(
          getRunbookContract,
          { environment: this.environment, service: SERVICE },
          { store: this.store, clock: this.clock },
        ),
    );

    const runbookText = [
      runbook.output.procedure.title,
      ...runbook.output.procedure.prerequisites,
      ...runbook.output.procedure.steps,
      runbook.output.procedure.cautionNote,
    ].join("\n");
    const scan = scanForPromptInjection(runbookText);
    if (scan.flagged) {
      this.pushTimeline(
        "note",
        `Security review flagged ${scan.matches.length} suspicious phrase(s) in the runbook text; embedded instructions in tool output are never followed (see SECURITY.md).`,
      );
    }

    return {
      scope: {
        incident: "payment-failures",
        environment: this.environment,
        services: [SERVICE],
      },
      evidence: [
        {
          summary: "Listed recent deployments",
          sourceTool: listRecentContract.name,
        },
        {
          summary: `Deployment ${activeId} diff retrieved`,
          sourceTool: getDiffContract.name,
        },
        {
          summary: `Error rate elevated: ${errorRates.output.points.at(-1)?.value}`,
          sourceTool: getErrorRatesContract.name,
        },
        {
          summary: `Latency elevated: ${latency.output.points.at(-1)?.value}ms`,
          sourceTool: getLatencyContract.name,
        },
        {
          summary: "Runbook retrieved (untrusted)",
          sourceTool: getRunbookContract.name,
        },
      ],
      alternativeHypotheses: [
        {
          hypothesis: "Upstream network instability caused the error spike",
          supportingEvidence: ["Error rate data"],
          ruledOut: true,
          reason:
            "Onset correlates with deployment, not with any network event.",
        },
      ],
      evidenceSufficientForMutation: true,
      recommendedNextStep: `Roll back ${SERVICE} from ${activeId} to the previous healthy deployment.`,
      residualRisk: scan.flagged
        ? "Runbook contained suspicious phrasing; treated as untrusted."
        : "Low — evidence strongly supports rollback.",
    };
  }

  /**
   * Fans the investigation out to the observability and deployment
   * specialists (real, bounded, sequential TrueForge sessions via
   * specialist-fanout.ts) and records their merged findings. Never throws:
   * a total fan-out failure is logged to the timeline and leaves
   * specialistFindings unchanged rather than aborting the investigation.
   */
  private async runSpecialistFanOutStep(
    world: WorldState,
    activeId: DeploymentId,
  ): Promise<void> {
    this.pushTimeline(
      "note",
      "Delegating to observability and deployment specialists (bounded, sequential TrueForge sessions).",
    );
    this.notify();

    try {
      const fanOut = await runSpecialistFanOut({
        trueForgeClient: this.trueForgeClient,
        eventStore: this.eventStore,
        model: process.env.TRUEFORGE_MODEL ?? "anthropic/claude-sonnet-5",
        connectorNames: {
          observability:
            process.env.MCP_OBSERVABILITY_CONNECTOR_NAME ?? "observability",
          deployments:
            process.env.MCP_DEPLOYMENTS_CONNECTOR_NAME ?? "deployments",
          context: process.env.MCP_CONTEXT_CONNECTOR_NAME ?? "context",
        },
        environment: this.environment,
        service: SERVICE,
        activeDeploymentId: activeId,
        window: METRICS_WINDOW,
        store: this.store,
        clock: this.clock,
        onNote: (note) => this.pushTimeline("note", note),
      });

      this.specialistFindings = [
        {
          specialist: "observability-investigator",
          verdict: fanOut.observability.verdict,
          summary: fanOut.observability.summary,
          reason: fanOut.observability.reason,
          toolsUsed: [...fanOut.observability.toolsUsed],
        },
        {
          specialist: "deployment-investigator",
          verdict: fanOut.deployment.verdict,
          summary: fanOut.deployment.summary,
          reason: fanOut.deployment.reason,
          toolsUsed: [...fanOut.deployment.toolsUsed],
        },
      ];

      this.auditChain.append({
        type: "specialists.fanout_completed",
        sessionId: this.sessionId,
        payload: {
          hasDisagreement: fanOut.report.hasDisagreement,
          specialists: fanOut.report.specialistFindings.map(
            (f) => f.specialist,
          ),
        },
      });

      if (fanOut.report.hasDisagreement) {
        const summary = fanOut.report.disagreements
          .map(
            (d) =>
              `${d.specialists[0]} (${d.verdicts[0]}) vs ${d.specialists[1]} (${d.verdicts[1]})`,
          )
          .join("; ");
        this.pushTimeline(
          "note",
          `Specialists disagree — preserved, not hidden: ${summary}`,
        );
      } else {
        this.pushTimeline(
          "note",
          "Observability and deployment specialists agree on their verdict.",
        );
      }
      this.notify();
    } catch (error) {
      this.pushTimeline(
        "note",
        `Specialist fan-out failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
      this.notify();
    }
  }

  /**
   * Runs a real, generated anomaly-detection script inside the isolated
   * Docker sandbox (sandbox/runner.ts — never the host) over live
   * error-rate/latency evidence. Never throws: a sandbox failure is
   * reflected in `this.sandbox` and logged to the timeline rather than
   * aborting the investigation.
   */
  private async runSandboxDiagnosticStep(): Promise<void> {
    this.sandbox = {
      status: "running",
      network: "disabled",
      filesystem: "workspace-only",
    };
    this.pushTimeline(
      "note",
      "Running generated diagnostic code in the isolated Docker sandbox (network disabled, workspace-only filesystem).",
    );
    this.notify();

    const diagnostic = await runSandboxDiagnostic({
      store: this.store,
      clock: this.clock,
      service: SERVICE,
      window: METRICS_WINDOW,
      onNote: (note) => this.pushTimeline("note", note),
    });

    this.sandbox = {
      status: diagnostic.status,
      network: "disabled",
      filesystem: "workspace-only",
      lastRunSummary: diagnostic.summary,
      lastRunAt: this.clock.now().toISOString(),
    };
    this.pushTimeline("sandbox_execution", diagnostic.summary);
    this.auditChain.append({
      type: "sandbox.diagnostic_completed",
      sessionId: this.sessionId,
      payload: {
        status: diagnostic.status,
        durationMs: diagnostic.durationMs,
        anomalyDetected: diagnostic.anomalyDetected,
      },
    });
    this.notify();
  }

  /** Synthesizes the approval request from investigation findings. */
  private async buildApprovalFromResult(
    result: InvestigationResult,
    world: WorldState,
    activeId: DeploymentId,
  ): Promise<void> {
    this.state = "analyzing";
    this.notify();

    // Record hypotheses
    const mainHypothesis = this.evidenceGraph.recordHypothesis({
      sessionId: this.sessionId,
      statement: result.recommendedNextStep,
      supportingEvidenceIds: [],
      ruledOut: false,
    });
    for (const alt of result.alternativeHypotheses) {
      this.evidenceGraph.recordHypothesis({
        sessionId: this.sessionId,
        statement: alt.hypothesis,
        supportingEvidenceIds: [],
        ruledOut: alt.ruledOut,
        ...(alt.reason !== undefined ? { reason: alt.reason } : {}),
      });
    }
    this.hypotheses = this.evidenceGraph.listHypotheses().map((h) => ({
      id: h.id,
      statement: h.statement,
      ruledOut: h.ruledOut,
      ...(h.reason !== undefined ? { reason: h.reason } : {}),
      supportingEvidenceIds: [...h.supportingEvidenceIds],
    }));

    this.incidentTitle = `${result.scope.incident} in ${result.scope.environment} (${result.scope.services.join(", ")})`;

    // Append the commander's overall synthesis alongside the real
    // specialist fan-out findings already recorded by
    // runSpecialistFanOutStep() — never overwrite them (see
    // ARCHITECTURE.md "the commander must not hide conflicting results").
    this.specialistFindings = [
      ...this.specialistFindings,
      {
        specialist: "trueforge-commander",
        verdict: result.evidenceSufficientForMutation
          ? "supports_mutation"
          : "against_mutation",
        summary: result.recommendedNextStep,
        reason: result.residualRisk,
        toolsUsed: result.evidence.map((e) => e.sourceTool),
      },
    ];

    this.confidence = {
      confidencePercent: result.evidenceSufficientForMutation ? 85 : 50,
      uncertaintyFactors: result.residualRisk ? [result.residualRisk] : [],
    };

    if (!result.evidenceSufficientForMutation) {
      this.state = "investigating";
      this.pushTimeline(
        "note",
        "Agent determined evidence insufficient for mutation; no approval requested.",
      );
      this.notify();
      return;
    }

    // Build rollback approval
    const targetId = pickRollbackTarget(world, activeId);
    const rollbackArgs: RollbackInput = {
      service: SERVICE,
      environment: this.environment,
      currentDeploymentId: activeId,
      targetDeploymentId: targetId,
      idempotencyKey: `${this.sessionId}-round-${this.round}`,
    };
    const canonicalArgs = canonicalizeArguments(rollbackArgs);
    const argumentHash = hashArguments(canonicalArgs);

    this.evidenceGraph.recordProposedAction({
      sessionId: this.sessionId,
      toolName: "deployments.rollback",
      canonicalArgs,
      supportingHypothesisIds: [mainHypothesis.id],
    });

    const now = this.clock.now();
    const requestedAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + DEFAULT_APPROVAL_TTL_MS,
    ).toISOString();
    const approvalId = randomUUID();
    const evidenceIds = this.evidenceGraph.evidence
      .list()
      .map((e) => e.id)
      .slice(0, 5);
    this.evidenceGraph.linkApprovalRequest(approvalId, evidenceIds);

    // Fetch verification plan from runbook (if available)
    let verificationPlan: string[] = [];
    try {
      const runbook = runIncidentsTool(
        getRunbookContract,
        { environment: this.environment, service: SERVICE },
        { store: this.store, clock: this.clock },
      );
      verificationPlan = [...runbook.procedure.verification];
    } catch {
      verificationPlan = [
        "Query error_rate and confirm recovery.",
        "Query latency_p95 and confirm recovery.",
        "Verify target deployment is active and healthy.",
      ];
    }

    this.pendingApproval = {
      approvalId,
      toolName: "deployments.rollback",
      canonicalArgs,
      argumentHash,
      environment: this.environment,
      targetResource: SERVICE,
      riskLevel: "mutating",
      blastRadius: `Rolls back the ${SERVICE} service in ${this.environment} from ${activeId} to ${targetId}; no data migration; other services unaffected.`,
      verificationPlan,
      evidenceIds,
      requestedAt,
      expiresAt,
      status: "pending",
      rollbackArgs,
    };

    this.auditChain.append({
      type: "approval.requested",
      sessionId: this.sessionId,
      payload: { approvalId, toolName: "deployments.rollback", argumentHash },
    });

    this.state = "awaiting_approval";
    this.pushTimeline(
      "approval_requested",
      `Proposed rollback of ${SERVICE} to ${targetId}; awaiting human approval.`,
    );
    this.notify();
  }

  approve(): void {
    if (this.state !== "awaiting_approval" || !this.pendingApproval) {
      throw new InvalidSessionTransitionError(
        `Cannot approve from state "${this.state}"`,
      );
    }
    const request = this.pendingApproval;

    const grant: ApprovalGrant = {
      id: request.approvalId,
      sessionId: this.sessionId,
      toolName: request.toolName,
      argumentHash: request.argumentHash,
      environment: request.environment,
      targetResource: request.targetResource,
      riskLevel: request.riskLevel,
      approverIdentity: "operator",
      grantedAt: this.clock.now().toISOString(),
      expiresAt: request.expiresAt,
      consumed: false,
    };
    this.approvalStore.put(grant);

    const deps: PolicyGatewayDeps = {
      clock: this.clock,
      approvalStore: this.approvalStore,
      auditSink: this.policyAuditSink,
      killSwitch: this.killSwitch,
      sessionScope: this.sessionScope,
    };

    try {
      authorize(
        {
          sessionId: this.sessionId,
          toolName: request.toolName,
          arguments: request.rollbackArgs,
          environment: request.environment,
          targetResource: request.targetResource,
          approvalId: grant.id,
        },
        deps,
      );
    } catch (error) {
      this.pendingApproval = {
        ...request,
        status: mapPolicyErrorToApprovalStatus(error),
      };
      this.state = "failed";
      this.pushTimeline(
        "approval_decision",
        `Approval denied by the policy gateway: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.notify();
      throw error;
    }

    this.pendingApproval = { ...request, status: "consumed" };
    this.state = "approved";
    this.pushTimeline(
      "approval_decision",
      "Approval granted; authorization validated by the policy gateway.",
    );
    this.notify();

    this.state = "executing";
    this.notify();

    let rollbackOutput: RollbackOutput;
    try {
      rollbackOutput = runDeploymentsTool(
        rollbackContract,
        request.rollbackArgs,
        {
          store: this.store,
          clock: this.clock,
          idempotencyStore: this.idempotencyStore,
          auditSink: this.deploymentsAuditSink,
        },
      );
    } catch (error) {
      this.state = "failed";
      this.pushTimeline(
        "note",
        `Rollback execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.notify();
      throw error;
    }

    this.auditChain.append({
      type: "mutation.executed",
      sessionId: this.sessionId,
      payload: {
        toolName: "deployments.rollback",
        fromDeploymentId: rollbackOutput.fromDeploymentId,
        toDeploymentId: rollbackOutput.toDeploymentId,
      },
    });
    this.pushTimeline(
      "tool_call",
      `Executed deployments.rollback: ${rollbackOutput.fromDeploymentId} -> ${rollbackOutput.toDeploymentId}.`,
      "deployments.rollback",
      "trusted",
    );
    this.notify();

    this.runVerification(rollbackOutput);
  }

  /**
   * Demo helper: force the session into `awaiting_approval` with a fresh
   * pending approval so UI-driven demos can exercise approve/reject/resume
   * without racing the investigator. This is intentionally a test/demo
   * helper and should only be used in local/demo environments.
   */
  seedDemoApproval(): string {
    // If already awaiting approval, return the existing id
    if (this.state === "awaiting_approval" && this.pendingApproval) {
      return this.pendingApproval.approvalId;
    }

    // Build a minimal rollback approval based on current store state
    const world = this.store.load();
    const activeId = this.store.getActiveDeployment().id;
    const targetId = pickRollbackTarget(world, activeId);
    const rollbackArgs: RollbackInput = {
      service: SERVICE,
      environment: this.environment,
      currentDeploymentId: activeId,
      targetDeploymentId: targetId,
      idempotencyKey: `${this.sessionId}-demo-seed-${this.round}`,
    };
    const canonicalArgs = canonicalizeArguments(rollbackArgs);
    const argumentHash = hashArguments(canonicalArgs);
    const now = this.clock.now();
    const requestedAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + DEFAULT_APPROVAL_TTL_MS,
    ).toISOString();
    const approvalId = randomUUID();

    const evidenceIds = this.evidenceGraph.evidence
      .list()
      .map((e) => e.id)
      .slice(0, 5);
    this.evidenceGraph.linkApprovalRequest(approvalId, evidenceIds);

    this.pendingApproval = {
      approvalId,
      toolName: "deployments.rollback",
      canonicalArgs,
      argumentHash,
      environment: this.environment,
      targetResource: SERVICE,
      riskLevel: "mutating",
      blastRadius: `Rolls back the ${SERVICE} service in ${this.environment} from ${activeId} to ${targetId}; demo-only approval.`,
      verificationPlan: [
        "Query checkout error_rate and confirm it returns to its pre-incident baseline.",
      ],
      evidenceIds,
      requestedAt,
      expiresAt,
      status: "pending",
      rollbackArgs,
    };

    this.auditChain.append({
      type: "approval.requested",
      sessionId: this.sessionId,
      payload: { approvalId, toolName: "deployments.rollback", argumentHash },
    });

    this.state = "awaiting_approval";
    this.pushTimeline(
      "approval_requested",
      `Demo-seeded rollback approval ${approvalId}; awaiting human approval.`,
    );
    this.notify();
    return approvalId;
  }

  private runVerification(rollbackOutput: RollbackOutput): void {
    this.state = "verifying";
    this.notify();

    const errorRates = this.recordToolCall(
      getErrorRatesContract.name,
      { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
      "trusted",
      "Re-queried the checkout error rate after the rollback for verification.",
      () =>
        runObservabilityTool(
          getErrorRatesContract,
          { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
          { store: this.store, clock: this.clock },
        ),
    );
    const latency = this.recordToolCall(
      getLatencyContract.name,
      { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
      "trusted",
      "Re-queried the checkout latency after the rollback for verification.",
      () =>
        runObservabilityTool(
          getLatencyContract,
          { service: SERVICE, ...METRICS_WINDOW, limit: 100 },
          { store: this.store, clock: this.clock },
        ),
    );

    const latestError = errorRates.output.points.at(-1);
    const latestLatency = latency.output.points.at(-1);
    const activeDeployment = this.store.getActiveDeployment();

    const errorSignal = {
      name: "Checkout error rate",
      status: (latestError && latestError.value < 0.03
        ? "passed"
        : "failed") as "passed" | "failed",
      detail: `Latest error_rate=${latestError?.value ?? "unknown"} (threshold < 0.03).`,
    };
    const latencySignal = {
      name: "Checkout latency (p95)",
      status: (latestLatency && latestLatency.value < 1000
        ? "passed"
        : "failed") as "passed" | "failed",
      detail: `Latest latency_p95_ms=${latestLatency?.value ?? "unknown"} (threshold < 1000ms).`,
    };
    const healthSignal = {
      name: "Active deployment",
      status: (activeDeployment.id === rollbackOutput.toDeploymentId
        ? "passed"
        : "failed") as "passed" | "failed",
      detail: `Active deployment is now ${activeDeployment.id}.`,
    };
    const signals = [errorSignal, latencySignal, healthSignal];
    const allPassed = signals.every((s) => s.status === "passed");

    this.verification = {
      status: allPassed ? "passed" : "failed",
      signals,
      residualRisk: allPassed
        ? "Low residual risk: rollback restored the last known-good configuration; continue monitoring per the runbook."
        : "Verification signals did not all pass; escalate to on-call before considering this incident resolved.",
    };
    this.specialistFindings = [
      ...this.specialistFindings,
      {
        specialist: "verification-agent",
        verdict: allPassed ? "supports_mutation" : "against_mutation",
        summary: `Post-rollback verification ${allPassed ? "passed" : "failed"} (${signals.filter((s) => s.status === "passed").length}/${signals.length} signals green).`,
        reason: allPassed
          ? "All recovery signals returned to healthy thresholds after the rollback."
          : "At least one recovery signal remained outside its healthy threshold after the rollback.",
        toolsUsed: [getErrorRatesContract.name, getLatencyContract.name],
      },
    ];

    this.auditChain.append({
      type: "verification.recorded",
      sessionId: this.sessionId,
      payload: { status: this.verification.status },
    });
    this.pushTimeline(
      "verification",
      `Verification ${this.verification.status}.`,
    );

    this.state = allPassed ? "verified" : "failed";
    this.notify();
  }

  reject(reason: string): void {
    if (this.state !== "awaiting_approval" || !this.pendingApproval) {
      throw new InvalidSessionTransitionError(
        `Cannot reject from state "${this.state}"`,
      );
    }
    this.policyAuditSink.record({
      type: "approval.rejected",
      occurredAt: this.clock.now().toISOString(),
      sessionId: this.sessionId,
      toolName: this.pendingApproval.toolName,
      outcome: "rejected",
      reason,
    });
    this.pendingApproval = { ...this.pendingApproval, status: "rejected" };
    this.state = "rejected";
    this.auditChain.append({
      type: "approval.rejected",
      sessionId: this.sessionId,
      payload: { reason },
    });
    this.pushTimeline("approval_decision", `Approval rejected: ${reason}`);
    this.notify();
  }

  resume(): void {
    if (this.state !== "rejected") {
      throw new InvalidSessionTransitionError(
        `Cannot resume from state "${this.state}"`,
      );
    }
    this.round += 1;
    void this.runInvestigation();
  }

  emergencyStop(): void {
    if (
      this.state === "verified" ||
      this.state === "stopped" ||
      this.state === "failed"
    ) {
      return;
    }
    this.killSwitch.activate();
    if (this.pendingApproval) {
      this.pendingApproval = { ...this.pendingApproval, status: "rejected" };
    }
    this.state = "stopped";
    this.auditChain.append({
      type: "session.emergency_stop",
      sessionId: this.sessionId,
      payload: {},
    });
    this.pushTimeline(
      "note",
      "Emergency stop activated: the kill switch is engaged and no further mutations are possible in this session.",
    );
    this.notify();
  }

  getViewModel(): SessionViewModelWire {
    const evidence: EvidenceViewWire[] = this.evidenceGraph.evidence
      .list()
      .map((item) => ({
        id: item.id,
        sourceTool: item.sourceTool,
        query: item.query,
        trust: item.trust,
        interpretation: item.interpretation,
        resultHash: item.resultHash,
        observedAt: item.observedAt,
      }));

    const auditTrail: AuditTrailEntryViewWire[] = this.auditChain
      .list()
      .map((entry) => ({
        sequence: entry.sequence,
        type: entry.type,
        occurredAt: entry.occurredAt,
        hash: entry.hash,
        previousHash: entry.previousHash,
      }));

    const approval: ApprovalCardViewWire | null = this.pendingApproval
      ? {
          approvalId: this.pendingApproval.approvalId,
          toolName: this.pendingApproval.toolName,
          canonicalArgs: this.pendingApproval.canonicalArgs,
          argumentHash: this.pendingApproval.argumentHash,
          environment: this.pendingApproval.environment,
          targetResource: this.pendingApproval.targetResource,
          riskLevel: this.pendingApproval.riskLevel,
          blastRadius: this.pendingApproval.blastRadius,
          verificationPlan: this.pendingApproval.verificationPlan,
          evidenceIds: this.pendingApproval.evidenceIds,
          requestedAt: this.pendingApproval.requestedAt,
          expiresAt: this.pendingApproval.expiresAt,
          status: this.pendingApproval.status,
        }
      : null;

    return {
      incident: {
        id: this.sessionId,
        title: this.incidentTitle,
        severity: "high",
        openedAt: this.incidentOpenedAt,
      },
      state: this.state,
      policyAvailable: true,
      timeline: this.timeline,
      evidence,
      hypotheses: this.hypotheses,
      confidence: this.confidence,
      specialistFindings: this.specialistFindings,
      sandbox: this.sandbox,
      approval,
      verification: this.verification,
      auditTrail,
    };
  }
}
