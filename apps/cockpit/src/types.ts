// The incident cockpit's external data contract. Every field the UI can
// render is defined here and validated with zod at the boundary where
// session state enters the app (see AGENTS.md "Validate all external
// input at boundaries") — the UI never derives state from free-form model
// text, only from this structured, versioned shape.
import { z } from "zod";

/** Explicit session states — see .github/instructions/frontend.instructions.md. */
export const SESSION_STATES = [
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
] as const;
export const sessionStateSchema = z.enum(SESSION_STATES);
export type SessionState = z.infer<typeof sessionStateSchema>;

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof severitySchema>;

export const incidentSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: severitySchema,
  openedAt: z.string().min(1),
});
export type IncidentSummary = z.infer<typeof incidentSummarySchema>;

export const evidenceTrustSchema = z.enum(["trusted", "untrusted"]);
export type EvidenceTrust = z.infer<typeof evidenceTrustSchema>;

export const evidenceViewSchema = z.object({
  id: z.string().min(1),
  sourceTool: z.string().min(1),
  query: z.string().min(1),
  trust: evidenceTrustSchema,
  interpretation: z.string().min(1),
  resultHash: z.string().min(1),
  observedAt: z.string().min(1),
});
export type EvidenceView = z.infer<typeof evidenceViewSchema>;

export const hypothesisViewSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  ruledOut: z.boolean(),
  reason: z.string().optional(),
  supportingEvidenceIds: z.array(z.string()).readonly(),
});
export type HypothesisView = z.infer<typeof hypothesisViewSchema>;

export const confidenceViewSchema = z.object({
  confidencePercent: z.number().min(0).max(100),
  uncertaintyFactors: z.array(z.string()).readonly(),
});
export type ConfidenceView = z.infer<typeof confidenceViewSchema>;

export const specialistVerdictSchema = z.enum([
  "supports_mutation",
  "against_mutation",
  "inconclusive",
]);
export type SpecialistVerdict = z.infer<typeof specialistVerdictSchema>;

export const specialistFindingViewSchema = z.object({
  specialist: z.string().min(1),
  verdict: specialistVerdictSchema,
  summary: z.string().min(1),
  reason: z.string().min(1),
  toolsUsed: z.array(z.string()).readonly(),
});
export type SpecialistFindingView = z.infer<typeof specialistFindingViewSchema>;

export const sandboxRunStatusSchema = z.enum([
  "idle",
  "running",
  "completed",
  "blocked",
  "error",
]);
export type SandboxRunStatus = z.infer<typeof sandboxRunStatusSchema>;

export const sandboxStatusViewSchema = z.object({
  status: sandboxRunStatusSchema,
  network: z.literal("disabled"),
  filesystem: z.literal("workspace-only"),
  lastRunSummary: z.string().optional(),
  lastRunAt: z.string().optional(),
});
export type SandboxStatusView = z.infer<typeof sandboxStatusViewSchema>;

export const riskLevelSchema = z.enum(["read-only", "mutating", "destructive"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

/** Mirrors the outcome the policy service already computed — the UI never recomputes or infers this, only renders it (and independently re-checks expiry against the client clock). */
export const approvalStatusSchema = z.enum([
  "pending",
  "expired",
  "argument_mismatch",
  "rejected",
  "consumed",
  "policy_unavailable",
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalCardViewSchema = z.object({
  approvalId: z.string().min(1),
  toolName: z.string().min(1),
  canonicalArgs: z.string().min(1),
  argumentHash: z.string().min(1),
  environment: z.string().min(1),
  targetResource: z.string().min(1),
  riskLevel: riskLevelSchema,
  blastRadius: z.string().min(1),
  verificationPlan: z.array(z.string()).readonly(),
  evidenceIds: z.array(z.string()).readonly(),
  requestedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  status: approvalStatusSchema,
});
export type ApprovalCardView = z.infer<typeof approvalCardViewSchema>;

export const verificationSignalStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
]);
export type VerificationSignalStatus = z.infer<
  typeof verificationSignalStatusSchema
>;

export const verificationSignalViewSchema = z.object({
  name: z.string().min(1),
  status: verificationSignalStatusSchema,
  detail: z.string().min(1),
});
export type VerificationSignalView = z.infer<
  typeof verificationSignalViewSchema
>;

export const verificationResultViewSchema = z.object({
  status: z.enum(["pending", "passed", "failed"]),
  signals: z.array(verificationSignalViewSchema).readonly(),
  residualRisk: z.string().min(1),
});
export type VerificationResultView = z.infer<
  typeof verificationResultViewSchema
>;

export const timelineEventKindSchema = z.enum([
  "tool_call",
  "tool_result",
  "sandbox_execution",
  "approval_requested",
  "approval_decision",
  "verification",
  "note",
]);
export type TimelineEventKind = z.infer<typeof timelineEventKindSchema>;

export const timelineEventViewSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(1),
  kind: timelineEventKindSchema,
  summary: z.string().min(1),
  toolName: z.string().optional(),
  trust: evidenceTrustSchema.optional(),
});
export type TimelineEventView = z.infer<typeof timelineEventViewSchema>;

export const auditTrailEntryViewSchema = z.object({
  sequence: z.number().int().min(0),
  type: z.string().min(1),
  occurredAt: z.string().min(1),
  hash: z.string().min(1),
  previousHash: z.string().min(1),
});
export type AuditTrailEntryView = z.infer<typeof auditTrailEntryViewSchema>;

export const sessionViewModelSchema = z.object({
  incident: incidentSummarySchema,
  state: sessionStateSchema,
  policyAvailable: z.boolean(),
  timeline: z.array(timelineEventViewSchema).readonly(),
  evidence: z.array(evidenceViewSchema).readonly(),
  hypotheses: z.array(hypothesisViewSchema).readonly(),
  confidence: confidenceViewSchema,
  specialistFindings: z.array(specialistFindingViewSchema).readonly(),
  sandbox: sandboxStatusViewSchema,
  approval: approvalCardViewSchema.nullable(),
  verification: verificationResultViewSchema.nullable(),
  auditTrail: z.array(auditTrailEntryViewSchema).readonly(),
});
export type SessionViewModel = z.infer<typeof sessionViewModelSchema>;

/** Validates an incoming session snapshot before it is ever rendered — untrusted until parsed. */
export function parseSessionViewModel(value: unknown): SessionViewModel {
  return sessionViewModelSchema.parse(value);
}
