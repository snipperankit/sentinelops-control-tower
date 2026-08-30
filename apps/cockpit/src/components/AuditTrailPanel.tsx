import type { AuditTrailEntryView } from "../types.js";
import { Panel } from "./Panel.js";

export interface AuditTrailPanelProps {
  readonly entries: readonly AuditTrailEntryView[];
}

export function AuditTrailPanel({ entries }: AuditTrailPanelProps) {
  return (
    <Panel
      title="Audit trail"
      aria-label="Audit trail"
      data-testid="audit-trail-panel"
      meta={entries.length > 0 ? `${entries.length} entries` : undefined}
      padded={false}
    >
      {entries.length === 0 ? (
        <p className="panel__empty">No audit entries recorded yet.</p>
      ) : (
        <ol className="audit-list">
          {entries.map((entry) => (
            <li key={entry.sequence} className="audit-row" data-testid={`audit-entry-${entry.sequence}`}>
              <span className="audit-row__sequence">#{entry.sequence}</span>
              <span className="audit-row__type">{entry.type}</span>
              <span className="audit-row__time">{entry.occurredAt}</span>
              <span className="audit-row__hash">hash {entry.hash.slice(0, 8)}…</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
