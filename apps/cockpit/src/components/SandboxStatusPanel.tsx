import type { SandboxStatusView, TimelineEventView } from "../types.js";
import { Badge } from "./Badge.js";
import { Panel } from "./Panel.js";

export interface SandboxStatusPanelProps {
  readonly sandbox: SandboxStatusView;
  readonly timeline?: readonly TimelineEventView[];
  readonly sessionId?: string;
}

const STATUS_TONE = {
  idle: "neutral",
  running: "accent",
  completed: "ok",
  blocked: "warn",
  error: "danger",
} as const;

export function SandboxStatusPanel({ sandbox, timeline, sessionId }: SandboxStatusPanelProps) {
  const TRUEFORGE_BASE = import.meta.env.VITE_TRUEFORGE_URL ?? "http://localhost:8790";
  const SESSION_API = import.meta.env.VITE_SESSION_API_URL ?? "";

  function findTrueForgeSessionId(timeline?: readonly TimelineEventView[]) {
    if (!timeline) return null;
    for (const ev of timeline) {
      if (!ev.summary) continue;
      const m = /TrueForge session\s+(\S+)/.exec(ev.summary);
      if (m) return m[1];
    }
    return null;
  }

  const tfSessionId = findTrueForgeSessionId(timeline);
  return (
    <Panel title="Sandbox" aria-label="Sandbox status" data-testid="sandbox-status-panel">
      <p className="panel__row">
        Status:{" "}
        <Badge tone={STATUS_TONE[sandbox.status]} data-testid="sandbox-status">
          {sandbox.status}
        </Badge>
      </p>
      <p className="panel__row">Network: {sandbox.network}</p>
      <p className="panel__row">Filesystem: {sandbox.filesystem}</p>
      {sandbox.lastRunSummary && (
        <p className="panel__row" data-testid="sandbox-last-run">
          {sandbox.lastRunSummary}
        </p>
      )}
          {tfSessionId && (
            <p className="panel__row">
              <a href={`${TRUEFORGE_BASE}/sessions/${tfSessionId}`} target="_blank" rel="noreferrer">
                View TrueForge session
              </a>
            </p>
          )}
          {sessionId && SESSION_API && (
            <p className="panel__row">
              <a href={`${SESSION_API.replace(/\/$/, "")}/api/incidents/${sessionId}`} target="_blank" rel="noreferrer">
                View session JSON
              </a>
            </p>
          )}
    </Panel>
  );
}
