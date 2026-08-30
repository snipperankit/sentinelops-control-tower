import type { VerificationResultView } from "../types.js";
import { Badge } from "./Badge.js";
import { Panel } from "./Panel.js";

export interface VerificationPanelProps {
  readonly verification: VerificationResultView | null;
}

const SIGNAL_TONE = {
  pending: "neutral",
  passed: "ok",
  failed: "danger",
} as const;

/**
 * Renders only a structured VerificationResultView — there is no code path
 * here that can derive "verified" from a free-form string, satisfying
 * "Never display success from model text alone".
 */
export function VerificationPanel({ verification }: VerificationPanelProps) {
  return (
    <Panel title="Verification" aria-label="Verification" data-testid="verification-panel">
      {!verification ? (
        <p className="panel__empty">Verification has not started.</p>
      ) : (
        <>
          <p className="panel__row">
            Status:{" "}
            <Badge tone={SIGNAL_TONE[verification.status]} data-testid="verification-status">
              {verification.status}
            </Badge>
          </p>
          <ul className="verification-panel__signals">
            {verification.signals.map((signal) => (
              <li key={signal.name} data-testid={`verification-signal-${signal.name}`}>
                <Badge tone={SIGNAL_TONE[signal.status]}>{signal.status}</Badge>{" "}
                {signal.name}: {signal.detail}
              </li>
            ))}
          </ul>
          <p className="panel__row" data-testid="residual-risk">
            Residual risk: {verification.residualRisk}
          </p>
        </>
      )}
    </Panel>
  );
}
