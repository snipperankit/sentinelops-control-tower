import type {
  ApprovalCardView,
  ConfidenceView,
  EvidenceView,
  IncidentSummary,
  SessionState,
} from "../types.js";
import { Badge } from "./Badge.js";

const SEVERITY_LABEL: Record<IncidentSummary["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const SEVERITY_TONE: Record<IncidentSummary["severity"], "neutral" | "warn" | "danger"> = {
  low: "neutral",
  medium: "warn",
  high: "danger",
  critical: "danger",
};

const STATE_TONE: Record<SessionState, "neutral" | "accent" | "ok" | "warn" | "danger"> = {
  investigating: "neutral",
  analyzing: "neutral",
  awaiting_approval: "warn",
  rejected: "danger",
  approved: "accent",
  executing: "accent",
  verifying: "accent",
  verified: "ok",
  failed: "danger",
  stopped: "danger",
};

const RISK_TONE: Record<ApprovalCardView["riskLevel"], "neutral" | "warn" | "danger"> = {
  "read-only": "neutral",
  mutating: "warn",
  destructive: "danger",
};

export interface IncidentHeaderProps {
  readonly incident: IncidentSummary;
  readonly state: SessionState;
  readonly confidence: ConfidenceView;
  readonly evidence: readonly EvidenceView[];
  readonly approval: ApprovalCardView | null;
  readonly now: Date;
}

/** Formats an elapsed duration as mm:ss.d (or Hh MMm once over an hour) — every digit is derived from real timestamps, never fabricated. */
function formatElapsed(openedAt: string, now: Date): string {
  const openedMs = new Date(openedAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - openedMs);
  const totalSeconds = elapsedMs / 1000;
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

export function IncidentHeader({
  incident,
  state,
  confidence,
  evidence,
  approval,
  now,
}: IncidentHeaderProps) {
  const trustedCount = evidence.filter((item) => item.trust === "trusted").length;

  return (
    <header className="incident-header" data-testid="incident-header">
      <div className="incident-header__top">
        <p className="incident-header__eyebrow">Incident · {incident.id}</p>
        <div className="incident-header__identity">
          <h1 data-testid="incident-title">{incident.title}</h1>
          <div className="incident-header__badges">
            <Badge tone={SEVERITY_TONE[incident.severity]} data-testid="incident-severity">
              {SEVERITY_LABEL[incident.severity]} severity
            </Badge>
            <Badge tone={STATE_TONE[state]}>{state.replace(/_/g, " ")}</Badge>
            {approval && (
              <Badge tone={RISK_TONE[approval.riskLevel]} data-testid="incident-risk-level">
                {approval.riskLevel}
              </Badge>
            )}
          </div>
        </div>
        <p className="incident-header__state" data-testid="incident-state">
          Current state: <strong>{state}</strong>
        </p>
      </div>

      <dl className="incident-header__stats">
        <div className="incident-header__stat">
          <dt>Confidence</dt>
          <dd data-testid="incident-stat-confidence">{confidence.confidencePercent}%</dd>
        </div>
        <div className="incident-header__stat">
          <dt>Signals</dt>
          <dd data-testid="incident-stat-signals">
            {trustedCount}/{evidence.length}
          </dd>
        </div>
        <div className="incident-header__stat">
          <dt>Elapsed</dt>
          <dd data-testid="incident-stat-elapsed">{formatElapsed(incident.openedAt, now)}</dd>
        </div>
      </dl>
    </header>
  );
}
