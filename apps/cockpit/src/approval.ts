// Pure, independently-testable approval-gating rules. The approval button
// must be disabled unless every one of these conditions holds — see
// .github/instructions/frontend.instructions.md "Disable approval controls
// when...". This is evaluated client-side against the client clock in
// addition to trusting the policy-computed `status`, so an approval that
// expired after the last snapshot was fetched is still caught.
import type { ApprovalCardView, SessionState } from "./types.js";

export interface ApprovalGateResult {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export function evaluateApprovalGate(
  approval: ApprovalCardView | null,
  sessionState: SessionState,
  policyAvailable: boolean,
  now: Date,
): ApprovalGateResult {
  const reasons: string[] = [];

  if (!policyAvailable) {
    reasons.push("The policy service is unavailable.");
  }

  if (!approval) {
    reasons.push("No approval request is pending.");
    return { allowed: false, reasons };
  }

  if (sessionState !== "awaiting_approval") {
    reasons.push(`Session is not awaiting approval (state: ${sessionState}).`);
  }
  if (
    approval.status === "expired" ||
    new Date(approval.expiresAt).getTime() <= now.getTime()
  ) {
    reasons.push("The approval request has expired.");
  }
  if (approval.status === "argument_mismatch") {
    reasons.push(
      "The action arguments changed since the approval was requested.",
    );
  }
  if (approval.status === "rejected" || approval.status === "consumed") {
    reasons.push(`The approval request was already ${approval.status}.`);
  }

  return { allowed: reasons.length === 0, reasons };
}
