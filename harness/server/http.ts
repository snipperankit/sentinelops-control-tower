// Session API HTTP + SSE server. Wraps LiveIncidentSession behind a small
// REST surface so apps/cockpit's LiveSessionClient can drive a real
// incident session instead of the scripted demo controller (see
// harness/server/README.md). Uses only Node's built-in http module — no
// framework dependency is warranted for this small, fixed route set (see
// .github/copilot-instructions.md "Do not introduce additional
// frameworks without a documented architectural reason").
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  LiveIncidentSession,
  InvalidSessionTransitionError,
} from "./incident-session.js";
import { fetchPullRequest } from "../../mcp/github/adapter.js";
import { fetchBitbucketPullRequest } from "../../mcp/bitbucket/adapter.js";
import { runSql } from "../../mcp/db/postgres.js";
import { postMessage } from "../../mcp/messaging/slack.js";
import { sendEmail } from "../../mcp/mail/google.js";
import { searchWeb } from "../../mcp/web/search.js";
import { queryGrafanaRange } from "../../mcp/observability/grafana-adapter.js";
import type { SessionViewModelWire } from "./contract.js";
import { SystemClock } from "../demo/clock.js";
import {
  FileApprovalStore,
  InMemoryPolicyAuditSink,
  type PolicyGatewayDeps,
  authorize,
} from "../../policy/index.js";
import { KillSwitch } from "../../policy/kill-switch.js";

export interface SessionApiServerOptions {
  readonly port: number;
  /** CORS origin allowed to call this API. Defaults to the cockpit's Vite dev server origin. */
  readonly corsOrigin?: string;
  /** Inject a TrueForge client for testing (avoids live server dependency). */
  readonly trueForgeClient?: import("../agent/session.js").TrueForgeClientLike;
}

export interface SessionApiServerHandle {
  readonly port: number;
  close(): Promise<void>;
}

const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const MAX_BODY_BYTES = 64 * 1024;

function setCorsHeaders(res: ServerResponse, corsOrigin: string): void {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

/** Reads and parses a JSON request body, rejecting bodies over MAX_BODY_BYTES (defense against unbounded input — see SECURITY.md). */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (raw.trim().length === 0) {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

/**
 * Creates the session API HTTP server. Sessions are held in an in-memory
 * registry scoped to this server instance — restarting the process loses
 * all in-flight sessions (acceptable for this demo-scale server; see
 * README "Known limitations").
 */
export function createSessionApiServer(
  options: SessionApiServerOptions,
): SessionApiServerHandle {
  const corsOrigin = options.corsOrigin ?? DEFAULT_CORS_ORIGIN;
  const sessions = new Map<string, LiveIncidentSession>();
  const streamSubscriptions = new Map<string, Set<ServerResponse>>();

  // Shared, in-memory policy dependencies for adapter endpoint authorization.
  const policyClock = new SystemClock();
  // Persistent approvals file (survives server restarts). Default path
  // is ./.demo-state/approvals.json relative to the repo root.
  const approvalsFile =
    process.env.APPROVALS_STORE_FILE ?? "./.demo-state/approvals.json";
  const approvalStore = new FileApprovalStore(approvalsFile);
  const policyAuditSink = new InMemoryPolicyAuditSink();
  const killSwitch = new KillSwitch(policyClock, policyAuditSink);

  function buildPolicyDeps(
    sessionId: string,
    environment = "sentinelops-demo",
  ): PolicyGatewayDeps {
    // If a live session exists for this id, prefer its scoped deps so
    // approvals created via the session's `approve()` are honored by
    // adapter authorization checks. Fall back to the shared global
    // deps for requests not associated with a session.
    const session = sessions.get(sessionId);
    if (session) {
      return session.getPolicyDeps();
    }
    return {
      clock: policyClock,
      approvalStore,
      auditSink: policyAuditSink,
      killSwitch,
      sessionScope: { sessionId, environment },
    };
  }

  function broadcast(sessionId: string, view: SessionViewModelWire): void {
    const subscribers = streamSubscriptions.get(sessionId);
    if (!subscribers) return;
    const payload = `data: ${JSON.stringify(view)}\n\n`;
    for (const res of subscribers) {
      res.write(payload);
    }
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });
  });

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    setCorsHeaders(res, corsOrigin);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);

    // POST /api/incidents
    if (
      req.method === "POST" &&
      segments.length === 2 &&
      segments[0] === "api" &&
      segments[1] === "incidents"
    ) {
      // Create session with shared persistent approval store and
      // policy audit sink so approvals created by the session persist.
      const session = LiveIncidentSession.create({
        approvalStore,
        policyAuditSink,
        ...(options.trueForgeClient !== undefined
          ? { trueForgeClient: options.trueForgeClient }
          : {}),
      });
      sessions.set(session.sessionId, session);
      session.subscribe((view) => broadcast(session.sessionId, view));
      sendJson(res, 201, { sessionId: session.sessionId });
      return;
    }

    // Routes under /api/incidents/:id/...
    if (
      segments.length >= 3 &&
      segments[0] === "api" &&
      segments[1] === "incidents"
    ) {
      const sessionId = segments[2] as string;
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { error: `Unknown session "${sessionId}"` });
        return;
      }

      // GET /api/incidents/:id
      if (req.method === "GET" && segments.length === 3) {
        sendJson(res, 200, session.getViewModel());
        return;
      }

      // GET /api/incidents/:id/stream (SSE)
      if (
        req.method === "GET" &&
        segments.length === 4 &&
        segments[3] === "stream"
      ) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(`data: ${JSON.stringify(session.getViewModel())}\n\n`);
        let subscribers = streamSubscriptions.get(sessionId);
        if (!subscribers) {
          subscribers = new Set();
          streamSubscriptions.set(sessionId, subscribers);
        }
        subscribers.add(res);
        req.on("close", () => {
          subscribers?.delete(res);
        });
        return;
      }

      // POST action routes
      if (req.method === "POST" && segments.length === 4) {
        const action = segments[3];
        try {
          if (action === "seed-approval") {
            // Demo-only: create a fresh pending approval for the session
            const approvalId = session.seedDemoApproval();
            sendJson(res, 200, { ok: true, approvalId });
            return;
          }
          if (action === "approve") {
            session.approve();
          } else if (action === "reject") {
            const body = await readJsonBody(req);
            const reason =
              typeof body === "object" && body !== null && "reason" in body
                ? String((body as { reason: unknown }).reason)
                : "Rejected by operator";
            session.reject(reason);
          } else if (action === "resume") {
            session.resume();
          } else if (action === "emergency-stop") {
            session.emergencyStop();
          } else {
            sendJson(res, 404, { error: `Unknown action "${action}"` });
            return;
          }
          sendJson(res, 200, { ok: true });
        } catch (error) {
          const status =
            error instanceof InvalidSessionTransitionError ? 409 : 422;
          sendJson(res, status, {
            error: error instanceof Error ? error.message : "Action failed",
          });
        }
        return;
      }
    }

    // GET /api/approvals[?sessionId=...] -> list persisted approvals
    if (
      req.method === "GET" &&
      segments.length === 2 &&
      segments[0] === "api" &&
      segments[1] === "approvals"
    ) {
      try {
        const params = url.searchParams;
        const sessionId = params.get("sessionId");
        let storeList: readonly unknown[] = [];
        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          const deps = session.getPolicyDeps();
          if (typeof (deps.approvalStore as any).list === "function") {
            storeList = (deps.approvalStore as any).list();
          }
        } else {
          if (typeof (approvalStore as any).list === "function") {
            storeList = (approvalStore as any).list();
          }
        }
        sendJson(res, 200, { ok: true, approvals: storeList });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/github  -> { owner, repo, pull_number }
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "github"
    ) {
      try {
        const body = await readJsonBody(req);
        const owner =
          typeof body === "object" && body !== null && "owner" in body
            ? String((body as any).owner)
            : "";
        const repo =
          typeof body === "object" && body !== null && "repo" in body
            ? String((body as any).repo)
            : "";
        const pull_number =
          typeof body === "object" && body !== null && "pull_number" in body
            ? Number((body as any).pull_number)
            : NaN;
        if (!owner || !repo || Number.isNaN(pull_number)) {
          sendJson(res, 400, {
            error: "owner, repo, and pull_number are required",
          });
          return;
        }
        const pr = await fetchPullRequest({ owner, repo, pull_number });
        sendJson(res, 200, { ok: true, pr });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/postgres -> { query, params }
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "postgres"
    ) {
      try {
        const body = (await readJsonBody(req)) as any;
        const query =
          typeof body === "object" && body !== null && "query" in body
            ? String(body.query)
            : "";
        const params = Array.isArray(body.params) ? body.params : [];
        if (!query) {
          sendJson(res, 400, { error: "query is required" });
          return;
        }
        // Determine whether this query is read-only (SELECT/WITH) or mutating.
        const isReadOnly = /^\s*(select|with)\b/i.test(query);
        if (!isReadOnly) {
          // Require approvalId for mutating queries
          const approvalId =
            typeof body === "object" && body !== null && "approvalId" in body
              ? String((body as any).approvalId)
              : undefined;
          const sessionIdForPolicy =
            typeof body === "object" && body !== null && "sessionId" in body
              ? String((body as any).sessionId)
              : "unknown-session";
          const deps = buildPolicyDeps(sessionIdForPolicy, "sentinelops-demo");
          // Build request object and only include optional approvalId when present
          const authReq: any = {
            sessionId: sessionIdForPolicy,
            toolName: "postgres.query",
            arguments: { query, params },
            environment: "sentinelops-demo",
            targetResource: "postgres",
          };
          if (approvalId !== undefined) authReq.approvalId = approvalId;
          authorize(authReq, deps);
        }

        const result = await runSql(query, params);
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/slack -> { channel, text }
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "slack"
    ) {
      try {
        const body = (await readJsonBody(req)) as any;
        const channel =
          typeof body === "object" && body !== null && "channel" in body
            ? String(body.channel)
            : "";
        const text =
          typeof body === "object" && body !== null && "text" in body
            ? String(body.text)
            : "";
        if (!channel || !text) {
          sendJson(res, 400, { error: "channel and text are required" });
          return;
        }
        // Slack posting is a mutating action. Authorize via policy gateway.
        const approvalId =
          typeof body === "object" && body !== null && "approvalId" in body
            ? String((body as any).approvalId)
            : undefined;
        const sessionIdForPolicy =
          typeof body === "object" && body !== null && "sessionId" in body
            ? String((body as any).sessionId)
            : "unknown-session";
        const deps = buildPolicyDeps(sessionIdForPolicy, "sentinelops-demo");
        const slackReq: any = {
          sessionId: sessionIdForPolicy,
          toolName: "slack.postMessage",
          arguments: { channel, text },
          environment: "sentinelops-demo",
          targetResource: channel,
        };
        if (approvalId !== undefined) slackReq.approvalId = approvalId;
        authorize(slackReq, deps);

        const result = await postMessage({ channel, text });
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/mail -> { to, subject, body }
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "mail"
    ) {
      try {
        const body = (await readJsonBody(req)) as any;
        const to =
          typeof body === "object" && body !== null && "to" in body
            ? String(body.to)
            : "";
        const subject =
          typeof body === "object" && body !== null && "subject" in body
            ? String(body.subject)
            : "";
        const mailBody =
          typeof body === "object" && body !== null && "body" in body
            ? String(body.body)
            : "";
        if (!to || !subject) {
          sendJson(res, 400, { error: "to and subject are required" });
          return;
        }
        // Sending email is a mutating action; authorize via policy gateway.
        const approvalId =
          typeof body === "object" && body !== null && "approvalId" in body
            ? String((body as any).approvalId)
            : undefined;
        const sessionIdForPolicy =
          typeof body === "object" && body !== null && "sessionId" in body
            ? String((body as any).sessionId)
            : "unknown-session";
        const deps = buildPolicyDeps(sessionIdForPolicy, "sentinelops-demo");
        const mailReq: any = {
          sessionId: sessionIdForPolicy,
          toolName: "mail.send",
          arguments: { to, subject },
          environment: "sentinelops-demo",
          targetResource: to,
        };
        if (approvalId !== undefined) mailReq.approvalId = approvalId;
        authorize(mailReq, deps);

        const result = await sendEmail({ to, subject, body: mailBody });
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/grafana -> { promQuery, from, to, stepSeconds?, datasourceUid? }
    // Read-only (query_range); no policy authorization required, matching
    // the github/search adapter routes below.
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "grafana"
    ) {
      try {
        const body = (await readJsonBody(req)) as any;
        const promQuery =
          typeof body === "object" && body !== null && "promQuery" in body
            ? String(body.promQuery)
            : "";
        const from =
          typeof body === "object" && body !== null && "from" in body
            ? String(body.from)
            : "";
        const to =
          typeof body === "object" && body !== null && "to" in body
            ? String(body.to)
            : "";
        if (!promQuery || !from || !to) {
          sendJson(res, 400, { error: "promQuery, from, and to are required" });
          return;
        }
        const stepSeconds =
          typeof body === "object" && body !== null && "stepSeconds" in body
            ? Number(body.stepSeconds)
            : undefined;
        const datasourceUid =
          typeof body === "object" && body !== null && "datasourceUid" in body
            ? String(body.datasourceUid)
            : undefined;
        const result = await queryGrafanaRange({
          promQuery,
          from,
          to,
          ...(stepSeconds !== undefined ? { stepSeconds } : {}),
          ...(datasourceUid !== undefined ? { datasourceUid } : {}),
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/search -> { query, limit }
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "search"
    ) {
      try {
        const body = (await readJsonBody(req)) as any;
        const query =
          typeof body === "object" && body !== null && "query" in body
            ? String(body.query)
            : "";
        const limit =
          typeof body === "object" && body !== null && "limit" in body
            ? Number(body.limit)
            : 5;
        if (!query) {
          sendJson(res, 400, { error: "query is required" });
          return;
        }
        const hits = await searchWeb(
          query,
          Math.max(1, Math.min(50, Number(limit) || 5)),
        );
        sendJson(res, 200, { ok: true, hits });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // POST /api/adapters/bitbucket -> { workspace, repoSlug, pull_request_id }
    if (
      req.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "bitbucket"
    ) {
      try {
        const body = await readJsonBody(req);
        const workspace =
          typeof body === "object" && body !== null && "workspace" in body
            ? String((body as any).workspace)
            : "";
        const repoSlug =
          typeof body === "object" && body !== null && "repoSlug" in body
            ? String((body as any).repoSlug)
            : "";
        const pull_request_id =
          typeof body === "object" && body !== null && "pull_request_id" in body
            ? Number((body as any).pull_request_id)
            : NaN;
        if (!workspace || !repoSlug || Number.isNaN(pull_request_id)) {
          sendJson(res, 400, {
            error: "workspace, repoSlug, and pull_request_id are required",
          });
          return;
        }
        const pr = await fetchBitbucketPullRequest({
          workspace,
          repoSlug,
          pullRequestId: pull_request_id,
        });
        sendJson(res, 200, { ok: true, pr });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // GET /api/adapters/status -> per-integration demo/live mode, for the
    // cockpit's Harness tab integration status grid. Never exposes the
    // credential values themselves, only whether each is configured.
    if (
      req.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "adapters" &&
      segments[2] === "status"
    ) {
      const mode = (configured: boolean) => (configured ? "live" : "demo");
      sendJson(res, 200, {
        ok: true,
        integrations: {
          github: mode(Boolean(process.env.GITHUB_TOKEN)),
          bitbucket: mode(
            Boolean(
              process.env.BITBUCKET_ACCESS_TOKEN ||
              (process.env.BITBUCKET_USERNAME &&
                process.env.BITBUCKET_APP_PASSWORD),
            ),
          ),
          search: mode(
            Boolean(process.env.SEARCH_API_KEY || process.env.BING_API_KEY),
          ),
          grafana: mode(
            Boolean(process.env.GRAFANA_URL && process.env.GRAFANA_API_TOKEN),
          ),
          slack: mode(Boolean(process.env.SLACK_TOKEN)),
          mail: mode(
            Boolean(process.env.SMTP_HOST || process.env.GOOGLE_API_KEY),
          ),
          postgres: mode(Boolean(process.env.POSTGRES_URL)),
        },
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  }

  server.listen(options.port);

  return {
    port: options.port,
    close(): Promise<void> {
      for (const subscribers of streamSubscriptions.values()) {
        for (const res of subscribers) {
          res.end();
        }
      }
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
