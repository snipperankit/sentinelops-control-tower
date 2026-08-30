import { useState } from "react";

export interface TopBarProps {
  readonly sessionId: string;
  readonly live: boolean;
  readonly onEmergencyStop: () => void;
  readonly emergencyStopDisabled: boolean;
}

/** Sticky top bar: brand, copyable session id, harness status, and the one place Emergency stop ever lives. */
export function TopBar({
  sessionId,
  live,
  onEmergencyStop,
  emergencyStopDisabled,
}: TopBarProps) {
  const [copied, setCopied] = useState(false);

  async function copySession() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(sessionId);
      }
    } catch {
      // Clipboard access can be denied by the browser; the id is still visible to copy by hand.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const shortId = sessionId.length > 13 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-5)}` : sessionId;

  return (
    <div className="topbar" data-testid="topbar">
      <div className="topbar__brand">
        <span className="topbar__brand-mark" aria-hidden="true">
          SO
        </span>
        <span className="topbar__brand-name">SentinelOps Control Tower</span>
      </div>
      <div className="topbar__divider" aria-hidden="true" />
      <button type="button" className="topbar__session" onClick={() => void copySession()}>
        <span className="topbar__session-label">session</span>
        <span className="topbar__session-id" title={sessionId}>
          {shortId}
        </span>
        <span className="topbar__session-copy">{copied ? "copied" : "copy"}</span>
      </button>
      <div className="topbar__spacer" />
      <div className="topbar__live" data-testid="harness-live-indicator">
        <span className={live ? "topbar__live-dot" : "topbar__live-dot topbar__live-dot--demo"} />
        {live ? "harness live" : "demo mode"}
      </div>
      <button
        type="button"
        className="topbar__stop"
        data-testid="emergency-stop-button"
        onClick={onEmergencyStop}
        disabled={emergencyStopDisabled}
        aria-label="Emergency stop: halt the incident session immediately"
      >
        Emergency stop
      </button>
    </div>
  );
}
