// Unit tests for mcp/observability/grafana-adapter.ts: demo mode (no
// credentials) returns deterministic synthetic points; live mode (both
// GRAFANA_URL and GRAFANA_API_TOKEN set) calls the Grafana datasource proxy
// with the expected URL/auth and parses a Prometheus range-query response.
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryGrafanaRange } from "../../mcp/observability/grafana-adapter.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("queryGrafanaRange", () => {
  it("returns deterministic demo-mode points when credentials are absent", async () => {
    delete process.env.GRAFANA_URL;
    delete process.env.GRAFANA_API_TOKEN;

    const result = await queryGrafanaRange({
      promQuery: "up",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:05:00.000Z",
      stepSeconds: 60,
    });

    expect(result.mode).toBe("demo");
    expect(result.points.length).toBeGreaterThan(0);
    // Deterministic: same inputs produce the same output every run.
    const again = await queryGrafanaRange({
      promQuery: "up",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:05:00.000Z",
      stepSeconds: 60,
    });
    expect(again.points).toEqual(result.points);
  });

  it("calls the Grafana datasource proxy in live mode and parses the response", async () => {
    process.env.GRAFANA_URL = "https://grafana.example.com";
    process.env.GRAFANA_API_TOKEN = "test-token";

    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      expect(String(url)).toContain(
        "/api/datasources/proxy/uid/ds-1/api/v1/query_range",
      );
      expect(String(url)).toContain("query=up");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { service: "checkout" },
                values: [[1735689600, "1"]],
              },
            ],
          },
        }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await queryGrafanaRange({
      promQuery: "up",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-01T00:05:00.000Z",
      datasourceUid: "ds-1",
    });

    expect(result.mode).toBe("live");
    expect(result.points).toEqual([
      {
        timestamp: new Date(1735689600 * 1000).toISOString(),
        value: 1,
        labels: { service: "checkout" },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit | undefined];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("throws when live mode is missing datasourceUid", async () => {
    process.env.GRAFANA_URL = "https://grafana.example.com";
    process.env.GRAFANA_API_TOKEN = "test-token";
    delete process.env.GRAFANA_DATASOURCE_UID;

    await expect(
      queryGrafanaRange({
        promQuery: "up",
        from: "2025-01-01T00:00:00.000Z",
        to: "2025-01-01T00:05:00.000Z",
      }),
    ).rejects.toThrow(/datasourceUid is required/);
  });

  it("falls back to GRAFANA_DATASOURCE_UID when datasourceUid is not passed", async () => {
    process.env.GRAFANA_URL = "https://grafana.example.com";
    process.env.GRAFANA_API_TOKEN = "test-token";
    process.env.GRAFANA_DATASOURCE_UID = "ds-from-env";

    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      expect(String(url)).toContain("/api/datasources/proxy/uid/ds-from-env/");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          status: "success",
          data: { resultType: "matrix", result: [] },
        }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await queryGrafanaRange({
      promQuery: "up",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-01T00:05:00.000Z",
    });

    expect(result.mode).toBe("live");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a typed error when Grafana responds with a non-OK status", async () => {
    process.env.GRAFANA_URL = "https://grafana.example.com";
    process.env.GRAFANA_API_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
          }) as unknown as Response,
      ),
    );

    await expect(
      queryGrafanaRange({
        promQuery: "up",
        from: "2025-01-01T00:00:00.000Z",
        to: "2025-01-01T00:05:00.000Z",
        datasourceUid: "ds-1",
      }),
    ).rejects.toThrow(/Grafana query failed: 502/);
  });
});
