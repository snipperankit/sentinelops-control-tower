// Structured investigation-result schema returned as the commander agent's
// final turn output (see AGENTS.md "Return structured investigation
// results"). `investigationResultJsonSchema` is a hand-authored JSON Schema
// literal kept in sync with `investigationResultSchema` manually: zod
// 3.25.x has no built-in `.toJSONSchema()`, and adding a `zod-to-json-schema`
// dependency for a single schema would be over-engineering (see
// tests.instructions.md discipline notes). Any change to one must be
// mirrored in the other; `tests/unit/agent-spec.test.ts` cross-checks a
// sample result against both.
import { z } from "zod";

export const investigationResultSchema = z.object({
  scope: z.object({
    incident: z.string(),
    environment: z.string(),
    services: z.array(z.string()),
  }),
  evidence: z.array(
    z.object({
      summary: z.string(),
      /** Name of the MCP tool that produced this evidence, e.g. "observability.get_metrics". */
      sourceTool: z.string(),
      provenance: z.record(z.unknown()).optional(),
    }),
  ),
  alternativeHypotheses: z.array(
    z.object({
      hypothesis: z.string(),
      supportingEvidence: z.array(z.string()),
      ruledOut: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
  /**
   * True only if the gathered evidence is strong enough to justify
   * proposing a mutation. The agent must never authorize or execute a
   * mutation itself regardless of this value (see AGENTS.md, SECURITY.md).
   */
  evidenceSufficientForMutation: z.boolean(),
  recommendedNextStep: z.string(),
  residualRisk: z.string(),
});

export type InvestigationResult = z.infer<typeof investigationResultSchema>;

export const investigationResultJsonSchema = {
  name: "sentinelops_investigation_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "scope",
      "evidence",
      "alternativeHypotheses",
      "evidenceSufficientForMutation",
      "recommendedNextStep",
      "residualRisk",
    ],
    properties: {
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["incident", "environment", "services"],
        properties: {
          incident: { type: "string" },
          environment: { type: "string" },
          services: { type: "array", items: { type: "string" } },
        },
      },
      evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "sourceTool"],
          properties: {
            summary: { type: "string" },
            sourceTool: { type: "string" },
            provenance: { type: "object" },
          },
        },
      },
      alternativeHypotheses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["hypothesis", "supportingEvidence", "ruledOut"],
          properties: {
            hypothesis: { type: "string" },
            supportingEvidence: { type: "array", items: { type: "string" } },
            ruledOut: { type: "boolean" },
            reason: { type: "string" },
          },
        },
      },
      evidenceSufficientForMutation: { type: "boolean" },
      recommendedNextStep: { type: "string" },
      residualRisk: { type: "string" },
    },
  },
} as const;
