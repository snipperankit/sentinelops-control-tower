// Wire contract for the live session API. Intentionally NOT imported from
// or into apps/cockpit/src/types.ts — the cockpit and the harness are
// independent packages (different tsconfigs, module resolution, and
// runtime targets), so the contract is mirrored on each side by
// convention rather than shared via a cross-package import (same
// decoupling already used for the scripted demo controller). Any change
// here must be mirrored in apps/cockpit/src/types.ts, and vice versa.
// tests/unit/session-view-model.test.ts cross-checks a built view model
// against this module's own schema; there is no automated cross-package
// check against the cockpit's copy — keep both in sync by hand.
import { z } from "zod";

export const sessionStateSchema = z.enum([
  "investigating",
  "analyzing",
  "awaiting_approval",
  "rejected",
  "approved",
  "executing",
  "verifying",
  "verified",
  "failed",
  "stopped",
]);
export type WireSessionState = z.infer<typeof sessionStateSchema>;

const incidentSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  openedAt: z.string().min(1),
});

const evidenceTrustSchema = z.enum(["trusted", "untrusted"]);

const evidenceViewSchema = z.object({
  id: z.string().min(1),
  sourceTool: z.string().min(1),
  query: z.string().min(1),
  trust: evidenceTrustSchema,
  interpretation: z.string().min(1),
  resultHash: z.string().min(1),
  observedAt: z.string().min(1),
});

const hypothesisViewSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  ruledOut: z.boolean(),
  reason: z.string().optional(),
  supportingEvidenceIds: z.array(z.string()),
});

const confidenceViewSchema = z.object({
  confidencePercent: z.number().min(0).max(100),
  uncertaintyFactors: z.array(z.string()),
});

const specialistFindingViewSchema = z.object({
  specialist: z.string().min(1),
  verdict: z.enum(["supports_mutation", "against_mutation", "inconclusive"]),
  summary: z.string().min(1),
  reason: z.string().min(1),
  toolsUsed: z.array(z.string()),
});

const sandboxStatusViewSchema = z.object({
  status: z.enum(["idle", "running", "completed", "blocked", "error"]),
  network: z.literal("disabled"),
  filesystem: z.literal("workspace-only"),
  lastRunSummary: z.string().optional(),
  lastRunAt: z.string().optional(),
});

const approvalCardViewSchema = z.object({
  approvalId: z.string().min(1),
  toolName: z.string().min(1),
  canonicalArgs: z.string().min(1),
  argumentHash: z.string().min(1),
  environment: z.string().min(1),
  targetResource: z.string().min(1),
  riskLevel: z.enum(["read-only", "mutating", "destructive"]),
  blastRadius: z.string().min(1),
  verificationPlan: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  requestedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  status: z.enum([
    "pending",
    "expired",
    "argument_mismatch",
    "rejected",
    "consumed",
    "policy_unavailable",
  ]),
});

const verificationSignalViewSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["pending", "passed", "failed"]),
  detail: z.string().min(1),
});

const verificationResultViewSchema = z.object({
  status: z.enum(["pending", "passed", "failed"]),
  signals: z.array(verificationSignalViewSchema),
  residualRisk: z.string().min(1),
});

const timelineEventViewSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(1),
  kind: z.enum([
    "tool_call",
    "tool_result",
    "sandbox_execution",
    "approval_requested",
    "approval_decision",
    "verification",
    "note",
  ]),
  summary: z.string().min(1),
  toolName: z.string().optional(),
  trust: evidenceTrustSchema.optional(),
});

const auditTrailEntryViewSchema = z.object({
  sequence: z.number().int().min(0),
  type: z.string().min(1),
  occurredAt: z.string().min(1),
  hash: z.string().min(1),
  previousHash: z.string().min(1),
});

export const sessionViewModelWireSchema = z.object({
  incident: incidentSummarySchema,
  state: sessionStateSchema,
  policyAvailable: z.boolean(),
  timeline: z.array(timelineEventViewSchema),
  evidence: z.array(evidenceViewSchema),
  hypotheses: z.array(hypothesisViewSchema),
  confidence: confidenceViewSchema,
  specialistFindings: z.array(specialistFindingViewSchema),
  sandbox: sandboxStatusViewSchema,
  approval: approvalCardViewSchema.nullable(),
  verification: verificationResultViewSchema.nullable(),
  auditTrail: z.array(auditTrailEntryViewSchema),
});

export type SessionViewModelWire = z.infer<typeof sessionViewModelWireSchema>;
export type IncidentSummaryWire = z.infer<typeof incidentSummarySchema>;
export type EvidenceViewWire = z.infer<typeof evidenceViewSchema>;
export type HypothesisViewWire = z.infer<typeof hypothesisViewSchema>;
export type SpecialistFindingViewWire = z.infer<
  typeof specialistFindingViewSchema
>;
export type SandboxStatusViewWire = z.infer<typeof sandboxStatusViewSchema>;
export type ApprovalCardViewWire = z.infer<typeof approvalCardViewSchema>;
export type VerificationResultViewWire = z.infer<
  typeof verificationResultViewSchema
>;
export type TimelineEventViewWire = z.infer<typeof timelineEventViewSchema>;
export type AuditTrailEntryViewWire = z.infer<typeof auditTrailEntryViewSchema>;
