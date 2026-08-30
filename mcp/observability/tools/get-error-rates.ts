// observability.get_error_rates: read-only error_rate metric points for one
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

export const getErrorRatesInputSchema = refineTimeWindow(
  z.object({
    service: serviceNameSchema,
    from: isoTimestampSchema,
    to: isoTimestampSchema,
    limit: resultLimitSchema,
  }),
);

export type GetErrorRatesInput = z.infer<typeof getErrorRatesInputSchema>;

export const getErrorRatesOutputSchema = z.object({
  points: z.array(
    z.object({
      service: serviceNameSchema,
      metric: z.literal("error_rate"),
      timestamp: z.string(),
      value: z.number(),
    }),
  ),
  truncated: z.boolean(),
  omittedCount: z.number().int().nonnegative(),
  stale: z.boolean(),
  provenance: provenanceSchema,
});

export type GetErrorRatesOutput = z.infer<typeof getErrorRatesOutputSchema>;

export const getErrorRatesContract: ToolContract<
  GetErrorRatesInput,
  GetErrorRatesOutput
> = {
  name: "observability.get_error_rates",
  description:
    "Read-only. Returns error_rate metric points for one service within an explicit [from, to] time window.",
  inputSchema: getErrorRatesInputSchema,
  outputSchema: getErrorRatesOutputSchema,
  risk: "read-only",
  requiredScope: ["observability:read"],
  timeoutMs: 2000,
  maxResultItems: 100,
  auditEventType: "observability.get_error_rates.invoked",
  execute: (input, { store, clock }) => {
    const world = loadWorldOrThrow(store);
    const candidates = world.metrics.filter(
      (point) =>
        point.service === input.service && point.metric === "error_rate",
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
        metric: "error_rate" as const,
      })),
      truncated,
      omittedCount,
      stale,
      provenance,
    };
  },
};
