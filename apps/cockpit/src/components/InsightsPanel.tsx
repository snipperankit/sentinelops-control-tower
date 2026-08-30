import { useState } from "react";
import type { HypothesisView, SpecialistFindingView } from "../types.js";
import { Panel } from "./Panel.js";
import { HypothesisPanel } from "./HypothesisPanel.js";
import { SpecialistFindings } from "./SpecialistFindings.js";

export interface InsightsPanelProps {
  readonly hypotheses: readonly HypothesisView[];
  readonly findings: readonly SpecialistFindingView[];
}

export function InsightsPanel({ hypotheses, findings }: InsightsPanelProps) {
  const [tab, setTab] = useState<'hypothesis' | 'findings'>('hypothesis');

  return (
    <Panel title="Insights" aria-label="Insights" data-testid="insights-panel">
      <div className="insights-tabs">
        <button
          type="button"
          className={`insights-tab ${tab === 'hypothesis' ? 'insights-tab--active' : ''}`}
          onClick={() => setTab('hypothesis')}
        >
          Hypotheses
        </button>
        <button
          type="button"
          className={`insights-tab ${tab === 'findings' ? 'insights-tab--active' : ''}`}
          onClick={() => setTab('findings')}
        >
          Specialist findings
        </button>
      </div>

      <div className="insights-body">
        {tab === 'hypothesis' ? (
          <HypothesisPanel hypotheses={hypotheses} />
        ) : (
          <SpecialistFindings findings={findings} />
        )}
      </div>
    </Panel>
  );
}

export default InsightsPanel;
