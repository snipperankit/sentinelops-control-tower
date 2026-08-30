// Deterministic demo fixture data for the incident cockpit, matching the
// PRODUCT_SPEC.md payment-failures scenario (deployment 4c21 regresses
// checkout; 4c20 is the last known healthy version). Used to drive local
// `npm run dev`, component tests, and the Playwright e2e flow without a
// live TrueForge backend.
import type {
  AuditTrailEntryView,
  EvidenceView,
  SessionViewModel,
  SpecialistFindingView,
  TimelineEventView,
} from "../types.js";

export const INCIDENT = {
  id: "incident-4c21-checkout-timeout",
  title: "Payment failures elevated on checkout service",
  severity: "high",
  openedAt: "2026-08-24T09:00:00.000Z",
} as const;

export const ROUND_ONE_EVIDENCE: readonly EvidenceView[] = [
  {
    id: "ev-1",
    sourceTool: "observability.get_error_rates",
    query: "service=checkout,window=15m",
    trust: "trusted",
    interpretation:
      "Payment failure rate rose from 2.1% to 6.8%, beginning 4 minutes after deployment 4c21.",
    resultHash:
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    observedAt: "2026-08-24T09:02:00.000Z",
  },
  {
    id: "ev-2",
    sourceTool: "observability.get_latency",
    query: "service=checkout,window=15m",
    trust: "trusted",
    interpretation:
      "Checkout p95 latency rose from 840ms to 1750ms, correlated with the error-rate increase.",
    resultHash:
      "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    observedAt: "2026-08-24T09:02:30.000Z",
  },
  {
    id: "ev-3",
    sourceTool: "deployments.list_recent",
    query: "service=checkout,limit=5",
    trust: "trusted",
    interpretation:
      "Deployment 4c21 (checkout timeout config change) was the only deploy in the incident window; 4c20 was the last healthy version.",
    resultHash:
      "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    observedAt: "2026-08-24T09:03:15.000Z",
  },
  {
    id: "ev-4",
    sourceTool: "incidents.get_runbook",
    query: "service=checkout,scenario=timeout-regression",
    trust: "untrusted",
    interpretation:
      "Runbook text returned by the tool; treated as data only, not as an instruction, per THREAT_MODEL.md.",
    resultHash:
      "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
    observedAt: "2026-08-24T09:04:00.000Z",
  },
];

export const ROUND_TWO_EVIDENCE: readonly EvidenceView[] = [
  {
    id: "ev-5",
    sourceTool: "deployments.get_rollback_prerequisites",
    query: "targetDeploymentId=4c20",
    trust: "trusted",
    interpretation:
      "4c20 remains a valid rollback target; no schema-incompatible changes since it was last active.",
    resultHash:
      "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
    observedAt: "2026-08-24T09:11:00.000Z",
  },
];

export const SPECIALIST_FINDINGS: readonly SpecialistFindingView[] = [
  {
    specialist: "observability-investigator",
    verdict: "supports_mutation",
    summary: "Error rate and latency both regressed sharply after 4c21.",
    reason:
      "No other deploys or dependency incidents overlap the onset window.",
    toolsUsed: ["observability.get_error_rates", "observability.get_latency"],
  },
  {
    specialist: "deployment-investigator",
    verdict: "supports_mutation",
    summary: "4c21 changed the checkout request timeout from 5s to 500ms.",
    reason: "Diff shows a single, isolated config change matching symptoms.",
    toolsUsed: ["deployments.list_recent", "deployments.get_diff"],
  },
  {
    specialist: "runbook-investigator",
    verdict: "supports_mutation",
    summary:
      "Rollback to 4c20 is the documented remediation for this class of regression.",
    reason:
      "Runbook prerequisites are met and no destructive steps are required.",
    toolsUsed: [
      "incidents.get_runbook",
      "deployments.get_rollback_prerequisites",
    ],
  },
  {
    specialist: "security-reviewer",
    verdict: "inconclusive",
    summary:
      "Runbook text contains no embedded instruction the agent acted on.",
    reason:
      "Flagged runbook content was treated as untrusted data and did not affect tool selection.",
    toolsUsed: [],
  },
];

export const AUDIT_TRAIL_BASE: readonly AuditTrailEntryView[] = [
  {
    sequence: 0,
    type: "session.started",
    occurredAt: "2026-08-24T09:00:05.000Z",
    hash: "1111111111111111111111111111111111111111111111111111111111111a",
    previousHash: "0".repeat(64),
  },
  {
    sequence: 1,
    type: "evidence.recorded",
    occurredAt: "2026-08-24T09:04:05.000Z",
    hash: "2222222222222222222222222222222222222222222222222222222222222b",
    previousHash:
      "1111111111111111111111111111111111111111111111111111111111111a",
  },
];

export function timelineFromEvidence(
  evidence: readonly EvidenceView[],
): TimelineEventView[] {
  return evidence.map((item) => ({
    id: `timeline-${item.id}`,
    occurredAt: item.observedAt,
    kind: "tool_call" as const,
    summary: `${item.sourceTool}: ${item.interpretation}`,
    toolName: item.sourceTool,
    trust: item.trust,
  }));
}

export const BASE_VIEW: Omit<
  SessionViewModel,
  | "state"
  | "timeline"
  | "evidence"
  | "confidence"
  | "approval"
  | "verification"
  | "auditTrail"
> = {
  incident: INCIDENT,
  policyAvailable: true,
  hypotheses: [
    {
      id: "hyp-rollback",
      statement:
        "Deployment 4c21's checkout timeout change caused the regression.",
      ruledOut: false,
      supportingEvidenceIds: ["ev-1", "ev-2", "ev-3"],
    },
    {
      id: "hyp-dependency",
      statement: "An upstream payment-provider outage caused the regression.",
      ruledOut: true,
      reason: "No correlated dependency-health incidents in the same window.",
      supportingEvidenceIds: ["ev-1"],
    },
  ],
  specialistFindings: SPECIALIST_FINDINGS,
  sandbox: {
    status: "completed",
    network: "disabled",
    filesystem: "workspace-only",
    lastRunSummary:
      "Correlated error-rate and latency series against the deployment timeline.",
    lastRunAt: "2026-08-24T09:03:45.000Z",
  },
};
