import type { SpecialistFindingView } from "../types.js";
import { Badge } from "./Badge.js";
import { Panel } from "./Panel.js";

export interface SpecialistFindingsProps {
  readonly findings: readonly SpecialistFindingView[];
}

const VERDICT_TONE = {
  supports_mutation: "warn",
  against_mutation: "ok",
  inconclusive: "neutral",
} as const;

export function SpecialistFindings({ findings }: SpecialistFindingsProps) {
  return (
    <Panel title="Specialist findings" aria-label="Specialist findings" data-testid="specialist-findings">
      {findings.length === 0 ? (
        <p className="panel__empty">No specialist findings yet.</p>
      ) : (
        <ul className="specialist-list">
          {findings.map((finding) => (
            <li key={finding.specialist} className="specialist-row" data-testid={`specialist-${finding.specialist}`}>
              <div className="specialist-row__header">
                <strong>{finding.specialist}</strong>
                <Badge tone={VERDICT_TONE[finding.verdict]} data-testid={`specialist-verdict-${finding.specialist}`}>
                  {finding.verdict}
                </Badge>
              </div>
              <p>{finding.summary}</p>
              <p className="specialist-row__reason">{finding.reason}</p>
              <p className="specialist-row__tools">Tools used: {finding.toolsUsed.join(", ") || "none"}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
