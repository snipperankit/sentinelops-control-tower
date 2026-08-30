// observability.query_grafana: read-only Prometheus range query proxied
// through Grafana, for a bounded [from, to] time window. Wraps the
// grafana-adapter.ts connector (demo mode when GRAFANA_URL/GRAFANA_API_TOKEN
// are unset => deterministic synthetic points; live mode => a real HTTP call
// to a configured Grafana instance) as a real, agent-chainable ToolContract,
// so the observability investigator specialist can call it during a live
// investigation exactly like the fixture-backed tools in this directory.
//
// Unlike every other tool in this registry, `execute` here is async (the
// live-mode branch performs a network call) — see contract.ts's
// `execute(...): Output | Promise<Output>` and `runTool()`.
import { z } from "zod";
import type { ToolContract } from "../contract.js";
import { BackendUnavailableError } from "../errors.js";
import { queryGrafanaRange } from "../grafana-adapter.js";
import {
  isoTimestampSchema,
  MAX_RESULT_LIMIT,
  refineTimeWindow,
  resultLimitSchema,
} from "../schemas.js";

export const queryGrafanaInputSchema = refineTimeWindow(
  z.object({
    /** PromQL query, e.g. "rate(http_requests_total{job=\"checkout\"}[5m])". */
    promQuery: z.string().min(1).max(500),
    from: isoTimestampSchema,
    to: isoTimestampSchema,
    /** Query resolution step, in seconds. Defaults to 60. */
    stepSeconds: z.number().int().positive().max(3600).optional(),
    limit: resultLimitSchema,
  }),
);

export type QueryGrafanaInput = z.infer<typeof queryGrafanaInputSchema>;

export const queryGrafanaOutputSchema = z.object({
  mode: z.enum(["demo", "live"]),
  points: z.array(
    z.object({
      timestamp: z.string(),
      value: z.number(),
      labels: z.record(z.string(), z.string()).optional(),
    }),
  ),
  truncated: z.boolean(),
  omittedCount: z.number().int().nonnegative(),
  provenance: z.object({
    source: z.literal("grafana"),
    retrievedAt: z.string(),
  }),
});

export type QueryGrafanaOutput = z.infer<typeof queryGrafanaOutputSchema>;

export const queryGrafanaContract: ToolContract<
  QueryGrafanaInput,
  QueryGrafanaOutput
> = {
  name: "observability.query_grafana",
  description:
    "Read-only. Runs a PromQL range query through a Grafana datasource proxy for an explicit [from, to] time window. Returns deterministic synthetic points when no live Grafana instance is configured (GRAFANA_URL/GRAFANA_API_TOKEN).",
  inputSchema: queryGrafanaInputSchema,
  outputSchema: queryGrafanaOutputSchema,
  risk: "read-only",
  requiredScope: ["observability:read"],
  timeoutMs: 5000,
  maxResultItems: MAX_RESULT_LIMIT,
  auditEventType: "observability.query_grafana.invoked",
  execute: async (input, { clock }) => {
    let result;
    try {
      result = await queryGrafanaRange({
        promQuery: input.promQuery,
        from: input.from,
        to: input.to,
        ...(input.stepSeconds !== undefined
          ? { stepSeconds: input.stepSeconds }
          : {}),
      });
    } catch (error) {
      throw new BackendUnavailableError(
        error instanceof Error ? error.message : String(error),
      );
    }

    const truncated = result.points.length > input.limit;
    const points = result.points.slice(0, input.limit);

    return {
      mode: result.mode,
      points,
      truncated,
      omittedCount: truncated ? result.points.length - input.limit : 0,
      provenance: {
        source: "grafana" as const,
        retrievedAt: clock.now().toISOString(),
      },
    };
  },
};
