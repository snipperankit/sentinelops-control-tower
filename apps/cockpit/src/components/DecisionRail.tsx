import { ApprovalCard } from "./ApprovalCard.js";
import { VerificationPanel } from "./VerificationPanel.js";
import { SandboxStatusPanel } from "./SandboxStatusPanel.js";
import { ConfidencePanel } from "./ConfidencePanel.js";
import { ProvenancePanel } from "./ProvenancePanel.js";
import type {
  ApprovalCardView,
  ConfidenceView,
  SandboxStatusView,
  SessionState,
  VerificationResultView,
  TimelineEventView,
  EvidenceView,
  SpecialistFindingView,
} from "../types.js";

export interface DecisionRailProps {
  readonly approval: ApprovalCardView | null;
  readonly sessionState: SessionState;
  readonly policyAvailable: boolean;
  readonly now: Date;
  readonly onApprove: () => void;
  readonly onReject: (reason: string) => void;
  readonly onResume: () => void;
  readonly verification: VerificationResultView | null;
  readonly sandbox: SandboxStatusView;
  readonly confidence: ConfidenceView;
  readonly timeline: readonly TimelineEventView[];
  readonly sessionId: string;
  readonly evidence: readonly EvidenceView[];
  readonly specialistFindings: readonly SpecialistFindingView[];
}

/**
 * The persistent decision rail: the approval checkpoint plus everything a
 * reviewer needs to decide (verification signals, sandbox status,
 * confidence) — always visible alongside whichever tab is open, never
 * gated behind navigation.
 */
export function DecisionRail({
  approval,
  sessionState,
  policyAvailable,
  now,
  onApprove,
  onReject,
  onResume,
  verification,
  sandbox,
  confidence,
  timeline,
  sessionId,
  evidence,
  specialistFindings,
}: DecisionRailProps) {
  // heuristics for auto-opening sections when they contain useful info
  const hasProvenance = (timeline ?? []).some((t) => t.kind === "tool_call" || t.kind === "tool_result") || (evidence ?? []).length > 0 || (specialistFindings ?? []).length > 0;
  const hasSandbox = !!(sandbox && (sandbox.status || sandbox.lastRunSummary));
  const hasConfidence = !!(confidence && (confidence.confidencePercent ?? 0) > 0);
  return (
    <aside className="decision-rail" data-testid="decision-rail" aria-label="Decision rail">
      <ApprovalCard
        approval={approval}
        sessionState={sessionState}
        policyAvailable={policyAvailable}
        now={now}
        onApprove={onApprove}
        onReject={onReject}
      />

      {sessionState === "rejected" && (
        <button
          type="button"
          className="decision-rail__resume"
          data-testid="resume-button"
          onClick={onResume}
        >
          Resume investigation
        </button>
      )}

      <details className="decision-rail__section" open>
        <summary className="decision-rail__summary">Verification</summary>
        <VerificationPanel verification={verification} />
      </details>

      <details className="decision-rail__section" open={hasProvenance}>
        <summary className="decision-rail__summary">Provenance</summary>
        <ProvenancePanel timeline={timeline} evidence={evidence} specialistFindings={specialistFindings} sessionId={sessionId} />
      </details>

      <details className="decision-rail__section" open={hasSandbox}>
        <summary className="decision-rail__summary">Sandbox</summary>
        <SandboxStatusPanel sandbox={sandbox} timeline={timeline} sessionId={sessionId} />
      </details>

      <details className="decision-rail__section" open={hasConfidence}>
        <summary className="decision-rail__summary">Confidence</summary>
        <ConfidencePanel confidence={confidence} />
      </details>
    </aside>
  );
}
