// observability.query_traces: read-only trace spans for one service within
// an explicit [from, to] time window, optionally filtered by status.
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

const traceStatusSchema = z.enum(["ok", "error"]);

export const queryTracesInputSchema = refineTimeWindow(
  z.object({
    service: serviceNameSchema,
    from: isoTimestampSchema,
    to: isoTimestampSchema,
    status: traceStatusSchema.optional(),
    limit: resultLimitSchema,
  }),
);

export type QueryTracesInput = z.infer<typeof queryTracesInputSchema>;

export const queryTracesOutputSchema = z.object({
  spans: z.array(
    z.object({
      traceId: z.string(),
      service: serviceNameSchema,
      operation: z.string(),
      timestamp: z.string(),
      durationMs: z.number(),
      status: traceStatusSchema,
    }),
  ),
  truncated: z.boolean(),
  omittedCount: z.number().int().nonnegative(),
  stale: z.boolean(),
  provenance: provenanceSchema,
});

export type QueryTracesOutput = z.infer<typeof queryTracesOutputSchema>;

export const queryTracesContract: ToolContract<
  QueryTracesInput,
  QueryTracesOutput
> = {
  name: "observability.query_traces",
  description:
    "Read-only. Returns trace spans for one service within an explicit [from, to] time window, optionally filtered by status.",
  inputSchema: queryTracesInputSchema,
  outputSchema: queryTracesOutputSchema,
  risk: "read-only",
  requiredScope: ["observability:read"],
  timeoutMs: 2000,
  maxResultItems: 100,
  auditEventType: "observability.query_traces.invoked",
  execute: (input, { store, clock }) => {
    const world = loadWorldOrThrow(store);
    const candidates = world.traces.filter(
      (span) =>
        span.service === input.service &&
        (input.status === undefined || span.status === input.status),
    );
    const { items, truncated, omittedCount, latestTimestamp } =
      filterWindowAndLimit({
        items: candidates,
        from: input.from,
        to: input.to,
        limit: input.limit,
        timestampOf: (span) => span.timestamp,
      });
    const { provenance, stale } = buildFreshness(
      clock,
      world.rolledBack,
      latestTimestamp,
    );

    return { spans: [...items], truncated, omittedCount, stale, provenance };
  },
};
