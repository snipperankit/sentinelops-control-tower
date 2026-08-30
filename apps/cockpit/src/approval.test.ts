import { describe, expect, it } from "vitest";
import { evaluateApprovalGate } from "./approval.js";
import type { ApprovalCardView } from "./types.js";

function baseApproval(
  overrides: Partial<ApprovalCardView> = {},
): ApprovalCardView {
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

describe("evaluateApprovalGate", () => {
  it("allows approval when pending, awaiting_approval, unexpired, and policy available", () => {
    const result = evaluateApprovalGate(
      baseApproval(),
      "awaiting_approval",
      true,
      NOW,
    );
    expect(result).toEqual({ allowed: true, reasons: [] });
  });

  it("disables when there is no approval request", () => {
    const result = evaluateApprovalGate(null, "awaiting_approval", true, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("No approval request is pending.");
  });

  it("disables when the session is not awaiting approval", () => {
    const result = evaluateApprovalGate(baseApproval(), "analyzing", true, NOW);
    expect(result.allowed).toBe(false);
    expect(
      result.reasons.some((r) => r.includes("not awaiting approval")),
    ).toBe(true);
  });

  it("disables when the approval has expired by clock time even if status says pending", () => {
    const result = evaluateApprovalGate(
      baseApproval({ expiresAt: "2026-08-24T09:04:00.000Z" }),
      "awaiting_approval",
      true,
      NOW,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("expired"))).toBe(true);
  });

  it("disables when the approval status is expired", () => {
    const result = evaluateApprovalGate(
      baseApproval({ status: "expired" }),
      "awaiting_approval",
      true,
      NOW,
    );
    expect(result.allowed).toBe(false);
  });

  it("disables when the action arguments changed (argument_mismatch)", () => {
    const result = evaluateApprovalGate(
      baseApproval({ status: "argument_mismatch" }),
      "awaiting_approval",
      true,
      NOW,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("arguments changed"))).toBe(
      true,
    );
  });

  it("disables when the approval was already rejected", () => {
    const result = evaluateApprovalGate(
      baseApproval({ status: "rejected" }),
      "awaiting_approval",
      true,
      NOW,
    );
    expect(result.allowed).toBe(false);
  });

  it("disables when the approval was already consumed", () => {
    const result = evaluateApprovalGate(
      baseApproval({ status: "consumed" }),
      "awaiting_approval",
      true,
      NOW,
    );
    expect(result.allowed).toBe(false);
  });

  it("disables when the policy service is unavailable, even if everything else is valid", () => {
    const result = evaluateApprovalGate(
      baseApproval(),
      "awaiting_approval",
      false,
      NOW,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("The policy service is unavailable.");
  });

  it("accumulates multiple blocking reasons at once", () => {
    const result = evaluateApprovalGate(
      baseApproval({ status: "expired" }),
      "verified",
      false,
      NOW,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});
