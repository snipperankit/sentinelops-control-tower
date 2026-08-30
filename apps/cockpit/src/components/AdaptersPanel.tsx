import { useEffect, useState } from "react";
import { Badge } from "./Badge.js";

const SESSION_API_URL = import.meta.env.VITE_SESSION_API_URL ?? "http://localhost:8810";

export interface AdaptersPanelProps {
  readonly sessionIdFromController?: string;
  readonly approvalIdFromController?: string;
}

type IntegrationMode = "demo" | "live";
type IntegrationStatus = Record<string, IntegrationMode>;

const INTEGRATION_LABELS: Record<string, string> = {
  github: "GitHub",
  bitbucket: "Bitbucket",
  search: "Web search",
  grafana: "Grafana",
  slack: "Slack",
  mail: "Gmail",
  postgres: "Postgres",
};

export function AdaptersPanel({ sessionIdFromController, approvalIdFromController }: AdaptersPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [queryText, setQueryText] = useState("select 1 as demo");
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [runAllResults, setRunAllResults] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (sessionIdFromController) setSessionId(sessionIdFromController);
  }, [sessionIdFromController]);

  useEffect(() => {
    if (approvalIdFromController) setApprovalId(approvalIdFromController);
  }, [approvalIdFromController]);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    try {
      const res = await fetch(`${SESSION_API_URL}/api/adapters/status`);
      const json = (await res.json()) as { integrations?: IntegrationStatus };
      if (json.integrations) setStatus(json.integrations);
    } catch {
      setStatus(null);
    }
  }

  async function fetchDemoPr() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${SESSION_API_URL}/api/adapters/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "octocat", repo: "Hello-World", pull_number: 1 }),
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchDemoBitbucketPr() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${SESSION_API_URL}/api/adapters/bitbucket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: "org", repoSlug: "repo", pull_request_id: 1 }),
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runQuery() {
    setLoading(true);
    setResult(null);
    try {
      const body: any = { query: queryText };
      if (liveMode) {
        if (sessionId) body.sessionId = sessionId;
        if (approvalId) body.approvalId = approvalId;
      }
      const res = await fetch(`${SESSION_API_URL}/api/adapters/postgres`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function postSlack() {
    setLoading(true);
    setResult(null);
    try {
      const body: any = { channel: "#rnd", text: "Hello from demo adapters panel" };
      if (liveMode) {
        if (sessionId) body.sessionId = sessionId;
        if (approvalId) body.approvalId = approvalId;
      }
      const res = await fetch(`${SESSION_API_URL}/api/adapters/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendDemoMail() {
    setLoading(true);
    setResult(null);
    try {
      const body: any = { to: "ops@example.com", subject: "Demo mail", body: "This is a demo." };
      if (liveMode) {
        if (sessionId) body.sessionId = sessionId;
        if (approvalId) body.approvalId = approvalId;
      }
      const res = await fetch(`${SESSION_API_URL}/api/adapters/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runSearch() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${SESSION_API_URL}/api/adapters/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "example query", limit: 3 }),
      });
      setResult(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runGrafanaQuery() {
    setLoading(true);
    setResult(null);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const res = await fetch(`${SESSION_API_URL}/api/adapters/grafana`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promQuery: "up", from, to: now.toISOString(), stepSeconds: 60 }),
      });
      setResult(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  // Exercises every read-only integration (no approval needed) in one pass
  // so a demo can show all tools working together at a glance. Mutating
  // tools (Slack/Gmail) are intentionally excluded here — they fail closed
  // without an approval, which is correct policy behavior, not a bug; use
  // their dedicated buttons above to see the approval-gated flow instead.
  async function runAllDemo() {
    setLoading(true);
    setResult(null);
    setRunAllResults(null);
    const now = new Date();
    const from = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const calls: Array<[string, () => Promise<Response>]> = [
      [
        "github",
        () =>
          fetch(`${SESSION_API_URL}/api/adapters/github`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner: "octocat", repo: "Hello-World", pull_number: 1 }),
          }),
      ],
      [
        "bitbucket",
        () =>
          fetch(`${SESSION_API_URL}/api/adapters/bitbucket`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace: "org", repoSlug: "repo", pull_request_id: 1 }),
          }),
      ],
      [
        "search",
        () =>
          fetch(`${SESSION_API_URL}/api/adapters/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "example query", limit: 3 }),
          }),
      ],
      [
        "grafana",
        () =>
          fetch(`${SESSION_API_URL}/api/adapters/grafana`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ promQuery: "up", from, to: now.toISOString(), stepSeconds: 60 }),
          }),
      ],
      [
        "postgres",
        () =>
          fetch(`${SESSION_API_URL}/api/adapters/postgres`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "select 1 as demo" }),
          }),
      ],
    ];
    const entries: Record<string, unknown> = {};
    for (const [name, call] of calls) {
      try {
        const res = await call();
        entries[name] = await res.json();
      } catch (err) {
        entries[name] = { ok: false, error: String(err) };
      }
    }
    setRunAllResults(entries);
    await refreshStatus();
    setLoading(false);
  }

  return (
    <section className="harness-panel adapters-panel">
      <h3 className="harness-panel__title">Adapters</h3>
      <p className="harness-panel__hint">Fetch demo or live adapter endpoints from the harness session API.</p>
      <div className="harness-panel__row" data-testid="integration-status-grid">
        {Object.entries(INTEGRATION_LABELS).map(([key, label]) => (
          <Badge key={key} tone={status?.[key] === "live" ? "ok" : "neutral"} data-testid={`integration-status-${key}`}>
            {label}: {status?.[key] ?? "…"}
          </Badge>
        ))}
      </div>
      <div className="harness-panel__row">
        <label className="harness-panel__checkbox">
          <input type="checkbox" checked={liveMode} onChange={(e) => setLiveMode(e.target.checked)} /> Live mode
        </label>
        <input
          className="harness-panel__input"
          placeholder="sessionId (optional)"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        />
        <input
          className="harness-panel__input"
          placeholder="approvalId (live mutating)"
          value={approvalId}
          onChange={(e) => setApprovalId(e.target.value)}
        />
      </div>
      <div className="harness-panel__actions">
        <button type="button" className="harness-panel__button" onClick={runAllDemo} disabled={loading}>
          {loading ? "Running…" : "Run all (demo)"}
        </button>
        <button type="button" className="harness-panel__button" onClick={fetchDemoPr} disabled={loading}>
          {loading ? "Fetching…" : "Fetch PR (demo)"}
        </button>
        <button type="button" className="harness-panel__button" onClick={fetchDemoBitbucketPr} disabled={loading}>
          Fetch Bitbucket PR (demo)
        </button>
        <div className="harness-panel__sql">
          <textarea
            className="harness-panel__textarea"
            rows={3}
            cols={40}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
          />
          <button type="button" className="harness-panel__button" onClick={runQuery} disabled={loading}>
            {loading ? "Running…" : "Run SQL"}
          </button>
        </div>
        <button type="button" className="harness-panel__button" onClick={postSlack} disabled={loading}>
          Post Slack
        </button>
        <button type="button" className="harness-panel__button" onClick={sendDemoMail} disabled={loading}>
          Send Mail
        </button>
        <button type="button" className="harness-panel__button" onClick={runSearch} disabled={loading}>
          Web Search
        </button>
        <button type="button" className="harness-panel__button" onClick={runGrafanaQuery} disabled={loading}>
          Query Grafana
        </button>
      </div>
      {runAllResults && (
        <pre className="harness-panel__result" data-testid="run-all-results">
          {JSON.stringify(runAllResults, null, 2)}
        </pre>
      )}
      {result && <pre className="harness-panel__result">{result}</pre>}
    </section>
  );
}

export default AdaptersPanel;
