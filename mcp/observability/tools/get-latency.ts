// observability.get_latency: read-only latency_p95_ms metric points for one
// service within an explicit [from, to] time window.
import { z } from "zod";
import { filterWindowAndLimit, loadWorldOrThrow } from "../backend.js";
import type { ToolContract } from "../contract.js";
import { buildFreshness } from "../provenance.js";
import {
  isoTimestampSchema,
  provenanceSchema,
  refineTimeWindow,
  resultLimitSchema,
  serviceNameSchema,
} from "../schemas.js";

export const getLatencyInputSchema = refineTimeWindow(
  z.object({
    service: serviceNameSchema,
    from: isoTimestampSchema,
    to: isoTimestampSchema,
    limit: resultLimitSchema,
  }),
);

export type GetLatencyInput = z.infer<typeof getLatencyInputSchema>;

export const getLatencyOutputSchema = z.object({
  points: z.array(
    z.object({
      service: serviceNameSchema,
      metric: z.literal("latency_p95_ms"),
      timestamp: z.string(),
      value: z.number(),
    }),
  ),
  truncated: z.boolean(),
  omittedCount: z.number().int().nonnegative(),
  stale: z.boolean(),
  provenance: provenanceSchema,
});

export type GetLatencyOutput = z.infer<typeof getLatencyOutputSchema>;

export const getLatencyContract: ToolContract<
  GetLatencyInput,
  GetLatencyOutput
> = {
  name: "observability.get_latency",
  description:
    "Read-only. Returns latency_p95_ms metric points for one service within an explicit [from, to] time window.",
  inputSchema: getLatencyInputSchema,
  outputSchema: getLatencyOutputSchema,
  risk: "read-only",
  requiredScope: ["observability:read"],
  timeoutMs: 2000,
  maxResultItems: 100,
  auditEventType: "observability.get_latency.invoked",
  execute: (input, { store, clock }) => {
    const world = loadWorldOrThrow(store);
    const candidates = world.metrics.filter(
      (point) =>
        point.service === input.service && point.metric === "latency_p95_ms",
    );
    const { items, truncated, omittedCount, latestTimestamp } =
      filterWindowAndLimit({
        items: candidates,
        from: input.from,
        to: input.to,
        limit: input.limit,
        timestampOf: (point) => point.timestamp,
      });
    const { provenance, stale } = buildFreshness(
      clock,
      world.rolledBack,
      latestTimestamp,
    );

    return {
      points: items.map((point) => ({
        ...point,
        metric: "latency_p95_ms" as const,
      })),
      truncated,
      omittedCount,
      stale,
      provenance,
    };
  },
};
