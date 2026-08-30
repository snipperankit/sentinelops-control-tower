import { SESSION_STATES, type SessionState } from "../types.js";
import { Panel } from "./Panel.js";

export interface AgentPhaseTrackerProps {
  readonly state: SessionState;
}

/** Renders every explicit state so the current agent phase is always visible in context, never inferred from prose. */
export function AgentPhaseTracker({ state }: AgentPhaseTrackerProps) {
  const currentIndex = SESSION_STATES.indexOf(state);
  const reached = SESSION_STATES.filter((_, idx) => idx <= currentIndex);
  const unreached = SESSION_STATES.filter((_, idx) => idx > currentIndex);

  return (
    <Panel title="Agent phase" data-testid="agent-phase-tracker" aria-label="Agent phase">
      <ol className="phase-pipeline">
        {reached.map((candidate) => (
          <li
            key={candidate}
            className={
              candidate === state
                ? "phase-pipeline__step phase-pipeline__step--current"
                : "phase-pipeline__step phase-pipeline__step--done"
            }
            aria-current={candidate === state ? "step" : undefined}
            data-testid={`phase-${candidate}`}
          >
            <span className="phase-pipeline__dot" aria-hidden="true" />
            {candidate.replace(/_/g, " ")}
          </li>
        ))}
      </ol>
      {unreached.length > 0 && (
        <div className="phase-pipeline__unreached">
          <p className="phase-pipeline__unreached-label">Not reached</p>
          <ol className="phase-pipeline phase-pipeline--unreached">
            {unreached.map((candidate) => (
              <li
                key={candidate}
                className="phase-pipeline__step phase-pipeline__step--unreached"
                data-testid={`phase-${candidate}`}
              >
                <span className="phase-pipeline__dot" aria-hidden="true" />
                {candidate.replace(/_/g, " ")}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
