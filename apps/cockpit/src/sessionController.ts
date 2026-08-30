// A scripted, deterministic session controller used for local demo mode
// and the Playwright e2e flow — no live TrueForge backend exists yet (see
// harness/README.md "Known limitations"). It walks the exact fixed
// sequence required by PRODUCT_SPEC.md/DEMO_SCRIPT.md:
//
//   investigating -> analyzing -> awaiting_approval -> rejected -> resume
//   -> analyzing -> awaiting_approval -> approved -> executing
//   -> verifying -> verified
//
// It never calls a mutation tool: `approve()` only flips local view-model
// state, exactly mirroring "the UI must never call a mutating tool
// directly" (SECURITY.md) — a real integration would resume the TrueForge
// session and let policy/harness perform the actual mutation.
import { evaluateApprovalGate } from "./approval.js";
import type { IncidentController } from "./controller.js";
import {
  AUDIT_TRAIL_BASE,
  BASE_VIEW,
  ROUND_ONE_EVIDENCE,
  ROUND_TWO_EVIDENCE,
  timelineFromEvidence,
} from "./fixtures/demoSession.js";
import type {
  ApprovalCardView,
  AuditTrailEntryView,
  SessionState,
  SessionViewModel,
  VerificationResultView,
} from "./types.js";

const ROUND_ONE_APPROVAL: ApprovalCardView = {
  approvalId: "approval-round-1",
  toolName: "deployments.rollback",
  canonicalArgs: JSON.stringify({
    targetDeploymentId: "4c20",
    service: "checkout",
  }),
  argumentHash:
    "f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
  environment: "production",
  targetResource: "checkout",
  riskLevel: "mutating",
  blastRadius: "Checkout service only; no data migration required.",
  verificationPlan: [
    "Query payment failure rate",
    "Query checkout latency",
    "Query deployment health",
  ],
  evidenceIds: ["ev-1", "ev-2", "ev-3"],
  requestedAt: "2026-08-24T09:05:00.000Z",
  expiresAt: "2026-08-24T09:20:00.000Z",
  status: "pending",
};

const ROUND_ONE_APPROVAL_REJECTED: ApprovalCardView = {
  ...ROUND_ONE_APPROVAL,
  status: "rejected",
};

const ROUND_TWO_APPROVAL: ApprovalCardView = {
  approvalId: "approval-round-2",
  toolName: "deployments.rollback",
  canonicalArgs: JSON.stringify({
    targetDeploymentId: "4c20",
    service: "checkout",
    verifyPrerequisitesFirst: true,
  }),
  argumentHash:
    "a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
  environment: "production",
  targetResource: "checkout",
  riskLevel: "mutating",
  blastRadius:
    "Checkout service only; rollback prerequisites independently confirmed.",
  verificationPlan: [
    "Query payment failure rate",
    "Query checkout latency",
    "Query deployment health",
    "Check request volume",
  ],
  evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-5"],
  requestedAt: "2026-08-24T09:12:00.000Z",
  expiresAt: "2026-08-24T09:27:00.000Z",
  status: "pending",
};

const VERIFICATION_RESULT: VerificationResultView = {
  status: "passed",
  signals: [
    {
      name: "payment_failure_rate",
      status: "passed",
      detail: "Returned to 2.0%.",
    },
    {
      name: "checkout_latency_p95",
      status: "passed",
      detail: "Returned to 850ms.",
    },
    {
      name: "deployment_health",
      status: "passed",
      detail: "4c20 reports healthy.",
    },
    {
      name: "request_volume",
      status: "passed",
      detail: "Within normal range.",
    },
  ],
  residualRisk:
    "Low: rollback restores a previously stable configuration; no residual anomalies observed.",
};

function auditEntry(
  base: readonly AuditTrailEntryView[],
  type: string,
  occurredAt: string,
): readonly AuditTrailEntryView[] {
  const previous = base[base.length - 1];
  const sequence = base.length;
  return [
    ...base,
    {
      sequence,
      type,
      occurredAt,
      hash: `${sequence}`.repeat(64).slice(0, 64),
      previousHash: previous?.hash ?? "0".repeat(64),
    },
  ];
}

interface Step {
  readonly state: SessionState;
  readonly build: (audit: readonly AuditTrailEntryView[]) => {
    view: SessionViewModel;
    audit: readonly AuditTrailEntryView[];
  };
}

const STEPS: readonly Step[] = [
  {
    state: "investigating",
    build: (audit) => ({
      view: {
        ...BASE_VIEW,
        state: "investigating",
        timeline: [],
        evidence: [],
        confidence: {
          confidencePercent: 10,
          uncertaintyFactors: ["Scope not yet established"],
        },
        approval: null,
        verification: null,
        auditTrail: audit,
      },
      audit,
    }),
  },
  {
    state: "analyzing",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "evidence.recorded",
        "2026-08-24T09:04:10.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "analyzing",
          timeline: timelineFromEvidence(ROUND_ONE_EVIDENCE),
          evidence: ROUND_ONE_EVIDENCE,
          confidence: {
            confidencePercent: 70,
            uncertaintyFactors: ["Rollback prerequisites not yet confirmed"],
          },
          approval: null,
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "awaiting_approval",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "approval.requested",
        "2026-08-24T09:05:05.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "awaiting_approval",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            {
              id: "timeline-approval-1",
              occurredAt: ROUND_ONE_APPROVAL.requestedAt,
              kind: "approval_requested",
              summary:
                "Requested approval to roll back checkout to deployment 4c20.",
            },
          ],
          evidence: ROUND_ONE_EVIDENCE,
          confidence: {
            confidencePercent: 78,
            uncertaintyFactors: ["Rollback prerequisites not yet confirmed"],
          },
          approval: ROUND_ONE_APPROVAL,
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "rejected",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "approval.rejected",
        "2026-08-24T09:06:00.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "rejected",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            {
              id: "timeline-approval-1-rejected",
              occurredAt: "2026-08-24T09:06:00.000Z",
              kind: "approval_decision",
              summary:
                "Approval rejected: reviewer requested independent confirmation of rollback prerequisites first.",
            },
          ],
          evidence: ROUND_ONE_EVIDENCE,
          confidence: {
            confidencePercent: 78,
            uncertaintyFactors: ["Rollback prerequisites not yet confirmed"],
          },
          approval: ROUND_ONE_APPROVAL_REJECTED,
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "analyzing",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "evidence.recorded",
        "2026-08-24T09:11:05.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "analyzing",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            ...timelineFromEvidence(ROUND_TWO_EVIDENCE),
          ],
          evidence: [...ROUND_ONE_EVIDENCE, ...ROUND_TWO_EVIDENCE],
          confidence: {
            confidencePercent: 92,
            uncertaintyFactors: [],
          },
          approval: null,
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "awaiting_approval",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "approval.requested",
        "2026-08-24T09:12:05.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "awaiting_approval",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            ...timelineFromEvidence(ROUND_TWO_EVIDENCE),
            {
              id: "timeline-approval-2",
              occurredAt: ROUND_TWO_APPROVAL.requestedAt,
              kind: "approval_requested",
              summary:
                "Re-requested approval to roll back checkout to deployment 4c20, with prerequisites confirmed.",
            },
          ],
          evidence: [...ROUND_ONE_EVIDENCE, ...ROUND_TWO_EVIDENCE],
          confidence: { confidencePercent: 92, uncertaintyFactors: [] },
          approval: ROUND_TWO_APPROVAL,
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "approved",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "approval.consumed",
        "2026-08-24T09:13:00.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "approved",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            ...timelineFromEvidence(ROUND_TWO_EVIDENCE),
            {
              id: "timeline-approval-2-granted",
              occurredAt: "2026-08-24T09:13:00.000Z",
              kind: "approval_decision",
              summary: "Approval granted for deployments.rollback to 4c20.",
            },
          ],
          evidence: [...ROUND_ONE_EVIDENCE, ...ROUND_TWO_EVIDENCE],
          confidence: { confidencePercent: 92, uncertaintyFactors: [] },
          approval: { ...ROUND_TWO_APPROVAL, status: "consumed" },
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "executing",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "mutation.executed",
        "2026-08-24T09:13:10.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "executing",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            ...timelineFromEvidence(ROUND_TWO_EVIDENCE),
            {
              id: "timeline-executing",
              occurredAt: "2026-08-24T09:13:10.000Z",
              kind: "tool_call",
              summary:
                "Executing deployments.rollback(targetDeploymentId=4c20).",
              toolName: "deployments.rollback",
            },
          ],
          evidence: [...ROUND_ONE_EVIDENCE, ...ROUND_TWO_EVIDENCE],
          confidence: { confidencePercent: 92, uncertaintyFactors: [] },
          approval: { ...ROUND_TWO_APPROVAL, status: "consumed" },
          verification: null,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "verifying",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "verification.started",
        "2026-08-24T09:14:00.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "verifying",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            ...timelineFromEvidence(ROUND_TWO_EVIDENCE),
          ],
          evidence: [...ROUND_ONE_EVIDENCE, ...ROUND_TWO_EVIDENCE],
          confidence: { confidencePercent: 92, uncertaintyFactors: [] },
          approval: { ...ROUND_TWO_APPROVAL, status: "consumed" },
          verification: { ...VERIFICATION_RESULT, status: "pending" },
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
  {
    state: "verified",
    build: (audit) => {
      const nextAudit = auditEntry(
        audit,
        "verification.completed",
        "2026-08-24T09:15:30.000Z",
      );
      return {
        view: {
          ...BASE_VIEW,
          state: "verified",
          timeline: [
            ...timelineFromEvidence(ROUND_ONE_EVIDENCE),
            ...timelineFromEvidence(ROUND_TWO_EVIDENCE),
            {
              id: "timeline-verified",
              occurredAt: "2026-08-24T09:15:30.000Z",
              kind: "verification",
              summary: "Recovery verified: all independent signals passed.",
            },
          ],
          evidence: [...ROUND_ONE_EVIDENCE, ...ROUND_TWO_EVIDENCE],
          confidence: { confidencePercent: 97, uncertaintyFactors: [] },
          approval: { ...ROUND_TWO_APPROVAL, status: "consumed" },
          verification: VERIFICATION_RESULT,
          auditTrail: nextAudit,
        },
        audit: nextAudit,
      };
    },
  },
];

/** Which explicit user action, if any, is required to leave a given step. */
function requiredActionFor(
  index: number,
): "auto" | "approve_or_reject" | "resume" {
  const step = STEPS[index];
  if (!step) return "auto";
  if (step.state === "awaiting_approval") return "approve_or_reject";
  if (step.state === "rejected") return "resume";
  return "auto";
}

export type ControllerAction =
  | "advance"
  | "approve"
  | "reject"
  | "resume"
  | "stop";

/** How long a freshly-issued demo approval stays valid, matching the fixture's original 15-minute windows (see ROUND_ONE_APPROVAL / ROUND_TWO_APPROVAL). */
const APPROVAL_WINDOW_MS = 15 * 60 * 1000;

export class ScriptedIncidentController implements IncidentController {
  private index = 0;
  private audit: readonly AuditTrailEntryView[] = AUDIT_TRAIL_BASE;
  private view: SessionViewModel;
  private readonly listeners = new Set<(view: SessionViewModel) => void>();
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
    const first = STEPS[0];
    if (!first) {
      throw new Error("incident script must have at least one step");
    }
    const built = first.build(this.audit);
    this.view = this.freshenApproval(built.view);
    this.audit = built.audit;
  }

  getState(): SessionViewModel {
    return this.view;
  }

  subscribe(listener: (view: SessionViewModel) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(view: SessionViewModel): void {
    this.view = this.freshenApproval(view);
    for (const listener of this.listeners) listener(this.view);
  }

  /**
   * The fixture's approval objects carry fixed 2026-08-24 timestamps for
   * narrative consistency with the rest of the demo script. Those are only
   * meaningful relative to "now" at the moment an approval becomes pending
   * — replay them against the controller's own clock so a freshly-entered
   * awaiting_approval step is never already expired, whether the clock is
   * real wall-clock time or a fixed test clock.
   */
  private freshenApproval(view: SessionViewModel): SessionViewModel {
    if (!view.approval || view.approval.status !== "pending") return view;
    const now = this.clock();
    return {
      ...view,
      approval: {
        ...view.approval,
        requestedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + APPROVAL_WINDOW_MS).toISOString(),
      },
    };
  }

  /** Whether the currently active step can move forward on its own (no human decision pending). */
  canAutoAdvance(): boolean {
    return (
      this.view.state !== "stopped" &&
      this.view.state !== "failed" &&
      this.view.state !== "verified" &&
      requiredActionFor(this.index) === "auto" &&
      this.index < STEPS.length - 1
    );
  }

  /** Advances an autonomous (agent-driven) step. No-op if a human decision is pending or the script is finished. */
  advance(): void {
    if (!this.canAutoAdvance()) return;
    this.index += 1;
    const step = STEPS[this.index];
    if (!step) return;
    const built = step.build(this.audit);
    this.audit = built.audit;
    this.commit(built.view);
  }

  approve(): void {
    const gate = evaluateApprovalGate(
      this.view.approval,
      this.view.state,
      this.view.policyAvailable,
      this.clock(),
    );
    if (!gate.allowed) {
      throw new Error(`approval blocked: ${gate.reasons.join("; ")}`);
    }
    // The happy-path script only ever asks for approval at the "round 2" step;
    // the first awaiting_approval step is always rejected in this fixed demo.
    this.index += 1;
    const step = STEPS[this.index];
    if (!step) return;
    const built = step.build(this.audit);
    this.audit = built.audit;
    this.commit(built.view);
  }

  reject(_reason: string): void {
    if (this.view.state !== "awaiting_approval") {
      throw new Error("cannot reject: session is not awaiting approval");
    }
    this.index += 1;
    const step = STEPS[this.index];
    if (!step) return;
    const built = step.build(this.audit);
    this.audit = built.audit;
    this.commit(built.view);
  }

  resume(): void {
    if (this.view.state !== "rejected") {
      throw new Error("cannot resume: session was not rejected");
    }
    this.index += 1;
    const step = STEPS[this.index];
    if (!step) return;
    const built = step.build(this.audit);
    this.audit = built.audit;
    this.commit(built.view);
  }

  /** Transitions to `stopped` from any non-terminal state. Only ever mutates local view state — never calls a mutation tool. */
  emergencyStop(): void {
    if (
      this.view.state === "stopped" ||
      this.view.state === "verified" ||
      this.view.state === "failed"
    ) {
      return;
    }
    const nextAudit = auditEntry(
      this.audit,
      "session.emergency_stopped",
      this.clock().toISOString(),
    );
    this.audit = nextAudit;
    this.commit({
      ...this.view,
      state: "stopped",
      approval: this.view.approval
        ? { ...this.view.approval, status: "consumed" }
        : null,
      auditTrail: nextAudit,
    });
  }
}
