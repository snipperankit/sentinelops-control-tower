import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalCard } from "./ApprovalCard.js";
import type { ApprovalCardView } from "../types.js";

function baseApproval(overrides: Partial<ApprovalCardView> = {}): ApprovalCardView {
  return {
    approvalId: "approval-1",
    toolName: "deployments.rollback",
    canonicalArgs: '{"targetDeploymentId":"4c20"}',
    argumentHash: "hash-1",
    environment: "production",
    targetResource: "checkout",
    riskLevel: "mutating",
    blastRadius: "checkout only",
    verificationPlan: ["check error rate"],
    evidenceIds: ["ev-1"],
    requestedAt: "2026-08-24T09:00:00.000Z",
    expiresAt: "2026-08-24T09:15:00.000Z",
    status: "pending",
    ...overrides,
  };
}

const NOW = new Date("2026-08-24T09:05:00.000Z");

describe("ApprovalCard", () => {
  it("renders every field from the validated policy data", () => {
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );

    expect(screen.getByTestId("approval-tool-name")).toHaveTextContent("deployments.rollback");
    expect(screen.getByTestId("approval-environment")).toHaveTextContent("production");
    expect(screen.getByTestId("approval-risk")).toHaveTextContent("mutating");
    expect(screen.getByTestId("approval-expiry")).toHaveTextContent("2026-08-24T09:15:00.000Z");
  });

  it("marks the pending approval card with role=alert so it cannot be missed", () => {
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("enables the approve button when every gate condition is satisfied", () => {
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId("approve-button")).toBeEnabled();
  });

  it("disables approve when the approval has expired", () => {
    render(
      <ApprovalCard
        approval={baseApproval({ expiresAt: "2026-08-24T09:00:00.000Z" })}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId("approve-button")).toBeDisabled();
    expect(screen.getByTestId("approval-blocked-reasons")).toHaveTextContent(/expired/);
  });

  it("disables approve when the arguments changed since the request", () => {
    render(
      <ApprovalCard
        approval={baseApproval({ status: "argument_mismatch" })}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId("approve-button")).toBeDisabled();
  });

  it("disables approve when the session is no longer awaiting approval", () => {
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="executing"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId("approve-button")).toBeDisabled();
  });

  it("disables approve when the policy service is unavailable", () => {
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="awaiting_approval"
        policyAvailable={false}
        now={NOW}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId("approve-button")).toBeDisabled();
  });

  it("calls onApprove only via explicit user click, never automatically", async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={onApprove}
        onReject={() => {}}
      />,
    );
    expect(onApprove).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("approve-button"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("calls onReject with a reason when the reject button is clicked", async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();
    render(
      <ApprovalCard
        approval={baseApproval()}
        sessionState="awaiting_approval"
        policyAvailable
        now={NOW}
        onApprove={() => {}}
        onReject={onReject}
      />,
    );
    await user.click(screen.getByTestId("reject-button"));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject.mock.calls[0]?.[0]).toEqual(expect.any(String));
  });
});
