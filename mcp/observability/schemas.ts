// Shared zod schemas for the observability MCP tools: service scope, ISO
// timestamps, an explicit [from, to] time window with a maximum span, and the
// provenance envelope every tool response must include.
import { z } from "zod";
import { SERVICE_NAMES } from "../../harness/demo/domain.js";

export const MAX_TIME_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
export const DEFAULT_RESULT_LIMIT = 50;
export const MAX_RESULT_LIMIT = 100;

export const serviceNameSchema = z.enum(SERVICE_NAMES);

export const isoTimestampSchema = z
  .string()
  .datetime({ message: "must be an ISO-8601 UTC timestamp" });

export const resultLimitSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_RESULT_LIMIT)
  .default(DEFAULT_RESULT_LIMIT);

export const provenanceSchema = z.object({
  source: z.literal("sentinelops-demo-world"),
  retrievedAt: z.string(),
  worldRolledBack: z.boolean(),
});

/**
 * Wraps an already-built object schema (which must include `from`/`to`
 * ISO-timestamp fields) with the shared time-window scope checks:
 * `from <= to` and a maximum window span. Every observability tool applies
 * this to enforce the "service and time-window scope" requirement in
 * PRODUCT_SPEC.md — no tool may scan the whole world.
 *
 * Takes a concrete schema (rather than a generic raw shape merged in here)
 * so `value.from`/`value.to` are known to be required strings, not
 * `string | undefined` — a generic merge over an unconstrained shape type
 * parameter defeats that inference.
 */
export function refineTimeWindow<
  Schema extends z.ZodType<{ from: string; to: string }>,
>(schema: Schema): z.ZodEffects<Schema, z.infer<Schema>, z.input<Schema>> {
  return schema.superRefine((value, ctx) => {
    const fromMs = Date.parse(value.from);
    const toMs = Date.parse(value.to);
    if (fromMs > toMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be earlier than or equal to to",
        path: ["from"],
      });
      return;
    }
    if (toMs - fromMs > MAX_TIME_WINDOW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `time window must not exceed ${MAX_TIME_WINDOW_MS}ms`,
        path: ["to"],
      });
    }
  });
}
