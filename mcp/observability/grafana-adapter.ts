// Real observability adapter for Grafana, following the same demo/live
// pattern as mcp/github/adapter.ts, mcp/messaging/slack.ts, and
// mcp/web/search.ts: absent credentials => deterministic demo-mode data;
// present credentials => a real HTTP call. This adapter is intentionally
// separate from the fixture-backed observability.get_error_rates /
// observability.get_latency MCP tools (mcp/observability/tools/*), which
// remain synchronous and fixture-only for the deterministic demo world —
// this is an additional, optional read-only connector reachable from
// harness/server/http.ts's /api/adapters/grafana route.
export interface QueryGrafanaRangeParams {
  /** PromQL query, e.g. "rate(http_requests_total{job=\"checkout\"}[5m])". */
  readonly promQuery: string;
  /** ISO-8601 UTC start timestamp. */
  readonly from: string;
  /** ISO-8601 UTC end timestamp. */
  readonly to: string;
  /** Query resolution step, in seconds. Defaults to 60. */
  readonly stepSeconds?: number;
  /** Grafana datasource UID to proxy through. Required in live mode. */
  readonly datasourceUid?: string;
}

export interface GrafanaMetricPoint {
  readonly timestamp: string;
  readonly value: number;
  /** Prometheus series labels, if any (e.g. { service: "checkout" }). */
  readonly labels?: Readonly<Record<string, string>>;
}

export interface QueryGrafanaRangeResult {
  readonly mode: "demo" | "live";
  readonly points: readonly GrafanaMetricPoint[];
}

interface PrometheusRangeResponse {
  readonly status: string;
  readonly data?: {
    readonly resultType?: string;
    readonly result?: ReadonlyArray<{
      readonly metric?: Readonly<Record<string, string>>;
      readonly values?: ReadonlyArray<readonly [number, string]>;
    }>;
  };
  readonly error?: string;
}

/** Deterministic demo-mode series: one point every `stepSeconds` between from/to, values derived from the timestamp so runs are reproducible. */
function buildDemoPoints(
  from: string,
  to: string,
  stepSeconds: number,
): GrafanaMetricPoint[] {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const stepMs = Math.max(1, stepSeconds) * 1000;
  const points: GrafanaMetricPoint[] = [];
  for (let ts = fromMs; ts <= toMs; ts += stepMs) {
    // Deterministic pseudo-value in [0, 1) from the timestamp, so demo mode
    // never depends on wall-clock randomness.
    const value = ((ts / stepMs) % 97) / 97;
    points.push({
      timestamp: new Date(ts).toISOString(),
      value: Math.round(value * 1000) / 1000,
      labels: { mode: "demo" },
    });
  }
  return points;
}

function assertHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`GRAFANA_URL must be http(s), got "${url.protocol}"`);
  }
  return url;
}

/**
 * Queries a Prometheus-compatible range query through a Grafana datasource
 * proxy. Demo mode (no GRAFANA_URL/GRAFANA_API_TOKEN) returns deterministic
 * synthetic points instead of calling out. Read-only; never mutates
 * anything in Grafana.
 */
export async function queryGrafanaRange(
  params: QueryGrafanaRangeParams,
): Promise<QueryGrafanaRangeResult> {
  const grafanaUrl = process.env.GRAFANA_URL;
  const token = process.env.GRAFANA_API_TOKEN;
  const stepSeconds = params.stepSeconds ?? 60;

  if (!grafanaUrl || !token) {
    return {
      mode: "demo",
      points: buildDemoPoints(params.from, params.to, stepSeconds),
    };
  }

  const datasourceUid =
    params.datasourceUid ?? process.env.GRAFANA_DATASOURCE_UID;
  if (!datasourceUid) {
    throw new Error(
      "datasourceUid is required in live mode (pass it explicitly or set GRAFANA_DATASOURCE_UID)",
    );
  }

  const base = assertHttpUrl(grafanaUrl);
  const proxyUrl = new URL(
    `/api/datasources/proxy/uid/${encodeURIComponent(datasourceUid)}/api/v1/query_range`,
    base,
  );
  proxyUrl.searchParams.set("query", params.promQuery);
  proxyUrl.searchParams.set(
    "start",
    String(Math.floor(Date.parse(params.from) / 1000)),
  );
  proxyUrl.searchParams.set(
    "end",
    String(Math.floor(Date.parse(params.to) / 1000)),
  );
  proxyUrl.searchParams.set("step", String(stepSeconds));

  const response = await fetch(proxyUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Grafana query failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as PrometheusRangeResponse;
  if (body.status !== "success") {
    throw new Error(`Grafana query error: ${body.error ?? "unknown error"}`);
  }

  const series = body.data?.result ?? [];
  const points: GrafanaMetricPoint[] = [];
  for (const s of series) {
    for (const [ts, value] of s.values ?? []) {
      points.push({
        timestamp: new Date(ts * 1000).toISOString(),
        value: Number(value),
        ...(s.metric ? { labels: s.metric } : {}),
      });
    }
  }

  return { mode: "live", points };
}

export default { queryGrafanaRange };
