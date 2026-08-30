import type { ConfidenceView } from "../types.js";
import { Panel } from "./Panel.js";

export interface ConfidencePanelProps {
  readonly confidence: ConfidenceView;
}

export function ConfidencePanel({ confidence }: ConfidencePanelProps) {
  return (
    <Panel title="Confidence" aria-label="Confidence and uncertainty" data-testid="confidence-panel">
      <p className="confidence-panel__value" data-testid="confidence-percent">
        {confidence.confidencePercent}% confidence
      </p>
      <div className="confidence-panel__bar" role="presentation">
        <div
          className="confidence-panel__bar-fill"
          style={{ width: `${confidence.confidencePercent}%` }}
        />
      </div>
      {confidence.uncertaintyFactors.length > 0 && (
        <ul className="confidence-panel__factors" data-testid="uncertainty-factors">
          {confidence.uncertaintyFactors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
