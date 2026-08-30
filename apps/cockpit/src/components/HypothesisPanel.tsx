import type { HypothesisView } from "../types.js";
import { Panel } from "./Panel.js";

export interface HypothesisPanelProps {
  readonly hypotheses: readonly HypothesisView[];
}

export function HypothesisPanel({ hypotheses }: HypothesisPanelProps) {
  const active = hypotheses.filter((h) => !h.ruledOut);
  const ruledOut = hypotheses.filter((h) => h.ruledOut);

  return (
    <Panel title="Current hypothesis" aria-label="Hypotheses" data-testid="hypothesis-panel">
      {active.length === 0 ? (
        <p className="panel__empty">No active hypothesis yet.</p>
      ) : (
        <ul className="hypothesis-list" data-testid="active-hypotheses">
          {active.map((h) => (
            <li key={h.id} data-testid={`hypothesis-${h.id}`}>
              {h.statement}
            </li>
          ))}
        </ul>
      )}
      {ruledOut.length > 0 && (
        <details className="hypothesis-panel__ruled-out" data-testid="ruled-out-hypotheses">
          <summary>Alternative hypotheses considered and ruled out ({ruledOut.length})</summary>
          <ul>
            {ruledOut.map((h) => (
              <li key={h.id} data-testid={`hypothesis-ruled-out-${h.id}`}>
                {h.statement}
                {h.reason ? ` — ${h.reason}` : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
