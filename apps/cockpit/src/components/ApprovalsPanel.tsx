import { useEffect, useState } from "react";

const SESSION_API_URL = import.meta.env.VITE_SESSION_API_URL ?? "http://localhost:8810";

export interface ApprovalsPanelProps {
  readonly sessionIdFromController?: string;
}

export function ApprovalsPanel({ sessionIdFromController }: ApprovalsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<any[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [modalEvidence, setModalEvidence] = useState<any[] | null>(null);
  const [sessionViews, setSessionViews] = useState<Record<string, any>>({});

  useEffect(() => {
    if (sessionIdFromController) setSessionId(sessionIdFromController);
  }, [sessionIdFromController]);

  async function fetchApprovals() {
    setLoading(true);
    try {
      const url = new URL(`${SESSION_API_URL}/api/approvals`);
      if (sessionId) url.searchParams.set("sessionId", sessionId);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.approvals)) {
        setApprovals(json.approvals);
        // Prefetch session views for approvals associated with live sessions
        const sessionIds: string[] = Array.from(
          new Set(json.approvals.map((a: any) => String(a.sessionId)).filter(Boolean)),
        );
        const views: Record<string, any> = {};
        await Promise.all(
          sessionIds.map(async (sid: string) => {
            try {
              const v = await fetchSessionView(sid);
              if (v) views[sid] = v;
            } catch {
              // ignore
            }
          }),
        );
        setSessionViews(views);
      } else {
        setApprovals([]);
      }
    } catch (err) {
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSessionView(sessionId: string) {
    try {
      const res = await fetch(`${SESSION_API_URL}/api/incidents/${sessionId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function handleApprove(approval: any) {
    if (!approval?.sessionId) {
      alert("Approval is not associated with a live session");
      return;
    }
    try {
      const res = await fetch(
        `${SESSION_API_URL}/api/incidents/${approval.sessionId}/approve`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Approve failed: ${body?.error ?? res.statusText}`);
        return;
      }
      // Refresh list after successful approve
      await fetchApprovals();
    } catch (err) {
      alert(String(err));
    }
  }

  function jumpToEvidence(evidenceId: string) {
    const el = document.querySelector(`[data-testid=\"evidence-item-${evidenceId}\"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "background-color 0.4s";
      const prev = el.style.backgroundColor;
      el.style.backgroundColor = "#fff6b3";
      setTimeout(() => {
        el.style.backgroundColor = prev;
      }, 800);
    } else {
      alert("Evidence not loaded in view. Open the incident view to see evidence.");
    }
  }

  function closeModal() {
    setModalEvidence(null);
  }

  useEffect(() => {
    // Auto-fetch once when mounted
    void fetchApprovals();
  }, []);

  return (
    <section className="harness-panel approvals-panel">
      <h3 className="harness-panel__title">Persisted approvals</h3>
      <div className="harness-panel__row">
        <input
          className="harness-panel__input"
          placeholder="sessionId (optional)"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        />
        <button type="button" className="harness-panel__button" onClick={() => void fetchApprovals()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="harness-panel__table-wrap">
        {approvals === null ? (
          <p className="panel__empty">Loading…</p>
        ) : approvals.length === 0 ? (
          <p className="panel__empty">No approvals persisted.</p>
        ) : (
          <table className="harness-table">
            <thead>
              <tr>
                <th>id</th>
                <th>sessionId</th>
                <th>tool</th>
                <th>status</th>
                <th>expiresAt</th>
                <th>evidence</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.sessionId}</td>
                  <td>{a.toolName}</td>
                  <td>{a.consumed ? "consumed" : "active"}</td>
                  <td>{a.expiresAt}</td>
                  <td>
                    {a.sessionId ? (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            const view = await fetchSessionView(a.sessionId);
                            if (view && Array.isArray(view.evidence)) {
                              setModalEvidence(view.evidence as any[]);
                            } else {
                              alert("Could not load session evidence.");
                            }
                          }}
                        >
                          View
                        </button>
                        <span style={{ marginLeft: 8, color: "#666" }}>
                          {Array.isArray(a.evidenceIds) ? `${a.evidenceIds.length} items` : "—"}
                        </span>
                        <div style={{ marginTop: 6, color: "#333", fontSize: 12 }}>
                          {/* Show short interpretation snippet from the first linked evidence when available */}
                          {(() => {
                            const sv = sessionViews[a.sessionId];
                            if (sv && sv.approval && Array.isArray(sv.approval.evidenceIds) && Array.isArray(sv.evidence)) {
                              const firstId = sv.approval.evidenceIds[0];
                              const ev = sv.evidence.find((x: any) => x.id === firstId);
                              if (ev && typeof ev.interpretation === 'string') {
                                const txt = ev.interpretation;
                                return txt.length > 120 ? `${txt.slice(0, 120)}…` : txt;
                              }
                            }
                            return <span style={{ color: '#888' }}>No summary</span>;
                          })()}
                        </div>
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td style={{ padding: 6 }}>
                    {!a.consumed && a.sessionId ? (
                      <button type="button" onClick={() => void handleApprove(a)}>
                        Approve
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modalEvidence && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div style={{ background: "white", padding: 16, width: "80%", maxHeight: "80%", overflow: "auto" }}>
            <h3>Evidence</h3>
            <button style={{ float: "right" }} onClick={closeModal}>
              Close
            </button>
            <ul>
              {modalEvidence.map((e) => (
                <li key={e.id} style={{ marginBottom: 8 }}>
                  <strong>{e.sourceTool}</strong>: {e.interpretation}
                  <div style={{ fontSize: 12, color: "#444" }}>
                    <div>query: {e.query}</div>
                    <div>observed: {e.observedAt}</div>
                    <div>
                      <a href="#" onClick={(ev) => { ev.preventDefault(); jumpToEvidence(e.id); }}>
                        Jump to evidence in view
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export default ApprovalsPanel;
