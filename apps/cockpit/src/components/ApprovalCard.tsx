import { useEffect } from "react";
import { evaluateApprovalGate } from "../approval.js";
import type { ApprovalCardView, SessionState } from "../types.js";
import { Badge } from "./Badge.js";

export interface ApprovalCardProps {
  readonly approval: ApprovalCardView | null;
  readonly sessionState: SessionState;
  readonly policyAvailable: boolean;
  readonly now: Date;
  readonly onApprove: () => void;
  readonly onReject: (reason: string) => void;
}

const STATUS_TONE: Record<ApprovalCardView["status"], "neutral" | "warn" | "ok" | "danger"> = {
  pending: "warn",
  expired: "danger",
  argument_mismatch: "danger",
  rejected: "danger",
  consumed: "ok",
  policy_unavailable: "danger",
};

/**
 * The approval checkpoint. Every value rendered here comes directly from
 * `ApprovalCardView` (validated policy data) — nothing is derived from
 * model prose. When a decision is pending, this card uses `role="alert"`
 * and prominent styling so it cannot be missed or scrolled past unnoticed.
 */
export function ApprovalCard({
  approval,
  sessionState,
  policyAvailable,
  now,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const isPending = sessionState === "awaiting_approval" && approval !== null;
  const gate = evaluateApprovalGate(approval, sessionState, policyAvailable, now);

  // Keyboard shortcut mirrors the visible button — it can never approve anything the button itself would refuse.
  useEffect(() => {
    if (!gate.allowed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onApprove();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gate.allowed, onApprove]);

  if (!approval) {
    return (
      <section
        aria-label="Approval"
        data-testid="approval-card"
        className="approval-card approval-card--none"
      >
        <h2 className="approval-card__title">Approval checkpoint</h2>
        <p className="approval-card__empty">No approval request is pending.</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Approval checkpoint"
      role={isPending ? "alert" : undefined}
      data-testid="approval-card"
      className={
        isPending ? "approval-card approval-card--pending" : "approval-card"
      }
    >
      <div className="approval-card__header">
        <h2 className="approval-card__title">Approval checkpoint</h2>
        <Badge tone={STATUS_TONE[approval.status]} data-testid="approval-status">
          {approval.status}
        </Badge>
      </div>

      <dl className="approval-card__kv">
        <div className="approval-card__row">
          <dt>Tool</dt>
          <dd data-testid="approval-tool-name">{approval.toolName}</dd>
        </div>
        <div className="approval-card__row">
          <dt>Environment</dt>
          <dd data-testid="approval-environment">{approval.environment}</dd>
        </div>
        <div className="approval-card__row">
          <dt>Target</dt>
          <dd data-testid="approval-target">{approval.targetResource}</dd>
        </div>
        <div className="approval-card__row">
          <dt>Risk</dt>
          <dd data-testid="approval-risk">{approval.riskLevel}</dd>
        </div>
        <div className="approval-card__row">
          <dt>Blast radius</dt>
          <dd data-testid="approval-blast-radius">{approval.blastRadius}</dd>
        </div>
        <div className="approval-card__row">
          <dt>Expires</dt>
          <dd data-testid="approval-expiry">{approval.expiresAt}</dd>
        </div>
      </dl>

      <details className="approval-card__args">
        <summary>Canonical arguments</summary>
        <pre data-testid="approval-arguments">{approval.canonicalArgs}</pre>
      </details>

      <div className="approval-card__block">
        <p className="approval-card__block-label">Verification plan</p>
        <ul data-testid="approval-verification-plan">
          {approval.verificationPlan.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>

      <p className="approval-card__evidence" data-testid="approval-evidence-ids">
        Supporting evidence: {approval.evidenceIds.join(", ")}
      </p>

      {/* If the approval was already acted on, surface a friendly, prominent
          outcome banner rather than the generic blocked reasons list. */}
      {(approval.status === "consumed" || approval.status === "rejected") ? (
        <div className={`approval-card__result approval-card__result--${approval.status}`} data-testid="approval-result">
          {approval.status === "consumed" ? (
            <strong>Approval already consumed — action executed.</strong>
          ) : (
            <strong>Approval request rejected.</strong>
          )}
        </div>
      ) : (
        !gate.allowed && (
          <ul className="approval-card__blocked-reasons" data-testid="approval-blocked-reasons">
            {gate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )
      )}

      <div className="approval-card__actions">
        <button
          type="button"
          className="approval-card__approve"
          data-testid="approve-button"
          disabled={!gate.allowed}
          onClick={onApprove}
        >
          Approve <span className="approval-card__shortcut">⌘⏎</span>
        </button>
        <button
          type="button"
          className="approval-card__reject"
          data-testid="reject-button"
          disabled={sessionState !== "awaiting_approval"}
          onClick={() => onReject("Reviewer requested additional confirmation.")}
        >
          Reject
        </button>
      </div>
      <p className="approval-card__footnote">
        Approval binds to this exact tool name and canonicalized arguments. Any change invalidates it.
      </p>
    </section>
  );
}
