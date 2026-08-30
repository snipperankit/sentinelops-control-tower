import { useState } from "react";
import type { EvidenceView, SpecialistFindingView, TimelineEventView } from "../types.js";
import { Panel } from "./Panel.js";

export interface ProvenancePanelProps {
  readonly timeline?: readonly TimelineEventView[];
  readonly evidence?: readonly EvidenceView[];
  readonly specialistFindings?: readonly SpecialistFindingView[];
  readonly sessionId?: string;
}

function findTrueForgeSessionId(timeline?: readonly TimelineEventView[]) {
  if (!timeline) return null;
  for (const ev of timeline) {
    if (!ev.summary) continue;
    const m = /TrueForge session\s+(\S+)/.exec(ev.summary);
    if (m) return m[1];
  }
  return null;
}

export function ProvenancePanel({ timeline, evidence = [], specialistFindings = [], sessionId }: ProvenancePanelProps) {
  const lastTool = (timeline ?? []).slice().reverse().find((t) => t.kind === "tool_call");
  const toolName = lastTool?.toolName ?? (lastTool?.summary ?? "n/a");
  const toolTime = lastTool?.occurredAt;
  const mcpAdapters = new Set<string>();
  for (const ev of evidence) {
    if (ev.sourceTool) mcpAdapters.add(ev.sourceTool);
  }
  for (const sf of specialistFindings) {
    for (const t of sf.toolsUsed ?? []) mcpAdapters.add(t);
  }
  // Also collect adapters from timeline tool calls/results so we don't miss adapters
  for (const t of timeline ?? []) {
    if ((t.kind === "tool_call" || t.kind === "tool_result") && (t as any).toolName) {
      mcpAdapters.add((t as any).toolName);
    }
  }
  const adapters = Array.from(mcpAdapters);
  const [showAllAdapters, setShowAllAdapters] = useState(false);
  const tfId = findTrueForgeSessionId(timeline);
  const sessionApi = import.meta.env.VITE_SESSION_API_URL ?? "http://localhost:8810";

  // Find approval decision event to surface 'who' performed the action if present in summary
  const approvalDecision = (timeline ?? []).slice().reverse().find((t) => t.kind === "approval_decision");
  const userText = approvalDecision?.summary ?? "not recorded";

  const visibleAdapters = showAllAdapters ? adapters : adapters.slice(0, 3);

  return (
    <Panel title="Provenance" aria-label="Provenance" data-testid="provenance-panel">
      <div className="provenance-row">
        <div>
          <div className="provenance__label">Last tool call</div>
          <div className="provenance__main"><strong>{toolName}</strong>{toolTime ? <span className="provenance__muted"> — {new Date(toolTime).toLocaleString()}</span> : null}</div>
        </div>
      </div>

      <div className="provenance-row">
        <div>
          <div className="provenance__label">MCP adapters</div>
          <div className="provenance__adapters">
            {visibleAdapters.length === 0 ? (
              <span className="provenance__muted">none</span>
            ) : (
              visibleAdapters.map((a) => (
                <span key={a} className="chip" title={a}>{a}</span>
              ))
            )}
            {adapters.length > 3 && (
              <button type="button" className="provenance__toggle" onClick={() => setShowAllAdapters((s) => !s)}>
                {showAllAdapters ? `Show less` : `+${adapters.length - 3} more`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="provenance-row">
        <div>
          <div className="provenance__label">Server</div>
          <div className="provenance__main">harness (session API)</div>
        </div>
      </div>

      <div className="provenance-row">
        <div>
          <div className="provenance__label">Session API</div>
          <div className="provenance__main"><a href={`${sessionApi.replace(/\/$/, "")}/api/incidents/${sessionId}`} target="_blank" rel="noreferrer">{new URL(sessionApi).host}</a></div>
        </div>
      </div>

      <div className="provenance-row">
        <div>
          <div className="provenance__label">TrueForge</div>
          <div className="provenance__main">{
            tfId ? (
              tfId === "failed" ? (
                <><strong>failed</strong> <span className="provenance__muted">(TrueForge session failed)</span></>
              ) : (
                <><strong>used</strong> <span className="provenance__muted">({tfId})</span> — <a href={`${(import.meta.env.VITE_TRUEFORGE_URL ?? "http://localhost:8790").replace(/\/$/,"")}/sessions/${tfId}`} target="_blank" rel="noreferrer">open</a></>
              )
            ) : (
              <span className="provenance__muted">not used</span>
            )
          }</div>
        </div>
      </div>

      <div className="provenance-row">
        <div>
          <div className="provenance__label">Policy</div>
          <div className="provenance__main provenance__muted">see policy status above</div>
        </div>
      </div>

      <div className="provenance-row">
        <div>
          <div className="provenance__label">User (last approval decision)</div>
          <div className="provenance__main"><strong>{userText}</strong></div>
        </div>
      </div>
    </Panel>
  );
}
