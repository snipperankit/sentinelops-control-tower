import { useEffect, useMemo, useState } from "react";
import { IncidentHeader } from "./components/IncidentHeader.js";
import { TopBar } from "./components/TopBar.js";
import { TabBar, type CockpitTab, type TabDefinition } from "./components/TabBar.js";
import { DecisionRail } from "./components/DecisionRail.js";
import { AgentPhaseTracker } from "./components/AgentPhaseTracker.js";
import { EventTimeline } from "./components/EventTimeline.js";
import { EvidencePanel } from "./components/EvidencePanel.js";
import InsightsPanel from "./components/InsightsPanel.js";
import { AuditTrailPanel } from "./components/AuditTrailPanel.js";
import AdaptersPanel from "./components/AdaptersPanel.js";
import ApprovalsPanel from "./components/ApprovalsPanel.js";
import type { IncidentController } from "./controller.js";
import { ScriptedIncidentController } from "./sessionController.js";
import { LiveSessionClient } from "./liveSessionClient.js";

const AUTO_ADVANCE_INTERVAL_MS = 800;
const CLOCK_TICK_MS = 100;

/** Set to connect the cockpit to a real session server (harness/server) instead of the scripted demo controller. */
const SESSION_API_URL = import.meta.env.VITE_SESSION_API_URL;

/** Harness tab (adapter/approval dev tools) is only ever shown outside of production builds. */
const SHOW_HARNESS_TAB = Boolean(import.meta.env.DEV || import.meta.env.VITEST);

/** Acquires the incident controller: the scripted demo controller is available synchronously; the live client requires an async connection to the session API. */
function useIncidentController(): {
  controller: IncidentController | null;
  connectError: string | null;
} {
  const [controller, setController] = useState<IncidentController | null>(
    () => (SESSION_API_URL ? null : new ScriptedIncidentController()),
  );
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!SESSION_API_URL || controller) return;
    // If an `incidentId` query param is present, attempt to rejoin that session
    const params = new URLSearchParams(window.location.search);
    const incidentId = params.get("incidentId");
    let cancelled = false;
    const connectPromise = incidentId
      ? LiveSessionClient.rejoin({ baseUrl: SESSION_API_URL, sessionId: incidentId })
          .catch((e) => {
            // If rejoin fails, fall back to creating a new session
            return LiveSessionClient.connect({ baseUrl: SESSION_API_URL } as any);
          })
      : LiveSessionClient.connect({ baseUrl: SESSION_API_URL });

    connectPromise
      .then((client) => {
        if (!cancelled) setController(client);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setConnectError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [controller]);

  return { controller, connectError };
}

/** Ticks a re-render roughly every 100ms so the header's Elapsed stat reflects a live clock, not a stale render. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function App() {
  const { controller, connectError } = useIncidentController();
  const [view, setView] = useState(() => controller?.getState() ?? null);
  const [tab, setTab] = useState<CockpitTab>("decision");
  const now = useNow();

  useEffect(() => {
    if (!controller) return;
    setView(controller.getState());
    return controller.subscribe(setView);
  }, [controller]);

  useEffect(() => {
    if (!controller?.canAutoAdvance()) return;
    const timer = window.setTimeout(() => controller.advance(), AUTO_ADVANCE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [controller, view]);

  const tabs: readonly TabDefinition[] = useMemo(() => {
    if (!view) return [];
    const base: TabDefinition[] = [
      { id: "decision", label: "Decision" },
      { id: "evidence", label: "Evidence", count: view.evidence.length },
      { id: "audit", label: "Audit trail", count: view.auditTrail.length },
    ];
    if (SHOW_HARNESS_TAB) base.push({ id: "harness", label: "Harness" });
    return base;
  }, [view]);

  if (connectError) {
    return (
      <main className="cockpit">
        <p role="alert">Could not connect to the session API: {connectError}</p>
      </main>
    );
  }

  if (!controller || !view) {
    return (
      <main className="cockpit">
        <p>Connecting to session…</p>
      </main>
    );
  }

  return (
    <>
      <TopBar
        sessionId={view.incident.id}
        live={Boolean(SESSION_API_URL)}
        onEmergencyStop={() => controller.emergencyStop()}
        emergencyStopDisabled={view.state === "stopped" || view.state === "verified"}
      />

      <main className="cockpit">
        <IncidentHeader
          incident={view.incident}
          state={view.state}
          confidence={view.confidence}
          evidence={view.evidence}
          approval={view.approval}
          now={now}
        />

        <TabBar tabs={tabs} active={tab} onChange={setTab} />

        <div className="cockpit__body">
          <div className="cockpit__main">
            <div
              role="tabpanel"
              id="tabpanel-decision"
              aria-labelledby="tab-decision"
              hidden={tab !== "decision"}
            >
              <AgentPhaseTracker state={view.state} />
              <InsightsPanel hypotheses={view.hypotheses} findings={view.specialistFindings} />
            </div>

            <div
              role="tabpanel"
              id="tabpanel-evidence"
              aria-labelledby="tab-evidence"
              hidden={tab !== "evidence"}
            >
              <EvidencePanel evidence={view.evidence} />
            </div>

            <div
              role="tabpanel"
              id="tabpanel-audit"
              aria-labelledby="tab-audit"
              hidden={tab !== "audit"}
            >
              <EventTimeline events={view.timeline} />
              <AuditTrailPanel entries={view.auditTrail} />
            </div>

            {SHOW_HARNESS_TAB && (
              <div
                role="tabpanel"
                id="tabpanel-harness"
                aria-labelledby="tab-harness"
                hidden={tab !== "harness"}
              >
                <p className="harness-panel__banner">DEV ONLY — direct adapter and approval tooling</p>
                <AdaptersPanel
                  sessionIdFromController={view.incident.id}
                  approvalIdFromController={view.approval?.approvalId ?? ""}
                />
                <ApprovalsPanel sessionIdFromController={view.incident.id} />
              </div>
            )}
          </div>

          <DecisionRail
            approval={view.approval}
            sessionState={view.state}
            policyAvailable={view.policyAvailable}
            now={now}
            onApprove={() => controller.approve()}
            onReject={(reason) => controller.reject(reason)}
            onResume={() => controller.resume()}
            verification={view.verification}
            sandbox={view.sandbox}
            timeline={view.timeline}
            sessionId={view.incident.id}
            evidence={view.evidence}
            specialistFindings={view.specialistFindings}
            confidence={view.confidence}
          />
        </div>
      </main>
    </>
  );
}

