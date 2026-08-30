import type { EvidenceView } from "../types.js";
import { Panel } from "./Panel.js";
import { TrustBadge } from "./Badge.js";

export interface EvidencePanelProps {
  readonly evidence: readonly EvidenceView[];
}

/** Renders only validated, hashed evidence items — never raw model prose. */
export function EvidencePanel({ evidence }: EvidencePanelProps) {
  const trustedCount = evidence.filter((item) => item.trust === "trusted").length;

  return (
    <Panel
      title="Evidence"
      aria-label="Evidence"
      data-testid="evidence-panel"
      meta={evidence.length > 0 ? `${trustedCount}/${evidence.length} trusted` : undefined}
      padded={false}
    >
      {evidence.length === 0 ? (
        <p className="panel__empty">No evidence recorded yet.</p>
      ) : (
        <ul className="evidence-list">
          {evidence.map((item) => (
            <li key={item.id} className="evidence-row" data-testid={`evidence-item-${item.id}`}>
              <TrustBadge trusted={item.trust === "trusted"} data-testid={`evidence-trust-${item.id}`} />
              <div className="evidence-row__body">
                <p className="evidence-row__headline">
                  <strong>{item.sourceTool}</strong>: {item.interpretation}
                </p>
                <div className="evidence-row__meta">
                  <span>query: {item.query}</span>
                  <span>observed: {item.observedAt}</span>
                  <span>hash: {item.resultHash.slice(0, 12)}…</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
