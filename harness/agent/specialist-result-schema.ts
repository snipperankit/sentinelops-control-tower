// Typed result schemas for each bounded specialist agent (see
// ARCHITECTURE.md "Agent boundaries", AGENTS.md "Return structured
// results"). Every specialist returns `toolsUsed` (self-reported tool
// names) so `delegation.ts`'s DelegationCoordinator can cross-check it
// against that specialist's static allowlist — a structural safety net
// independent of what the model claims about its own tool use.
//
// JSON Schema literals are hand-authored and kept in sync with the zod
// schemas manually, mirroring result-schema.ts's existing convention (zod
// 3.25.x has no built-in `.toJSONSchema()`; see that file's header comment
// for why a `zod-to-json-schema` dependency is not added for this).
import { z } from "zod";

export const SPECIALIST_NAMES = [
  "observability-investigator",
  "deployment-investigator",
  "runbook-investigator",
  "security-reviewer",
  "verification-agent",
] as const;
export type SpecialistName = (typeof SPECIALIST_NAMES)[number];

export const specialistVerdictSchema = z.enum([
  "supports_mutation",
  "against_mutation",
  "inconclusive",
]);
export type SpecialistVerdict = z.infer<typeof specialistVerdictSchema>;

const specialistResultBaseSchema = z.object({
  summary: z.string(),
  /** Tool names this specialist actually invoked, e.g. "observability.get_error_rates". */
  toolsUsed: z.array(z.string()),
  verdict: specialistVerdictSchema,
  reason: z.string(),
});

export const observabilityFindingsSchema = specialistResultBaseSchema.extend({
  anomalyDetected: z.boolean(),
  metrics: z.array(
    z.object({
      name: z.string(),
      sourceTool: z.string(),
      observation: z.string(),
    }),
  ),
});
export type ObservabilityFindings = z.infer<typeof observabilityFindingsSchema>;

export const deploymentFindingsSchema = specialistResultBaseSchema.extend({
  suspectDeploymentId: z.string().nullable(),
  correlatedWithIncidentOnset: z.boolean(),
});
export type DeploymentFindings = z.infer<typeof deploymentFindingsSchema>;

export const runbookFindingsSchema = specialistResultBaseSchema.extend({
  runbookFound: z.boolean(),
  recommendedProcedure: z.string().nullable(),
});
export type RunbookFindings = z.infer<typeof runbookFindingsSchema>;

export const securityReviewFindingsSchema = specialistResultBaseSchema.extend({
  promptInjectionDetected: z.boolean(),
  flaggedSources: z.array(z.string()),
});
export type SecurityReviewFindings = z.infer<
  typeof securityReviewFindingsSchema
>;

export const verificationFindingsSchema = specialistResultBaseSchema.extend({
  recoveryConfirmed: z.boolean(),
  residualAnomalies: z.array(z.string()),
});
export type VerificationFindings = z.infer<typeof verificationFindingsSchema>;

const baseRequired = ["summary", "toolsUsed", "verdict", "reason"] as const;
const baseProperties = {
  summary: { type: "string" },
  toolsUsed: { type: "array", items: { type: "string" } },
  verdict: {
    type: "string",
    enum: ["supports_mutation", "against_mutation", "inconclusive"],
  },
  reason: { type: "string" },
} as const;

export const observabilityFindingsJsonSchema = {
  name: "sentinelops_observability_findings",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [...baseRequired, "anomalyDetected", "metrics"],
    properties: {
      ...baseProperties,
      anomalyDetected: { type: "boolean" },
      metrics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "sourceTool", "observation"],
          properties: {
            name: { type: "string" },
            sourceTool: { type: "string" },
            observation: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export const deploymentFindingsJsonSchema = {
  name: "sentinelops_deployment_findings",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      ...baseRequired,
      "suspectDeploymentId",
      "correlatedWithIncidentOnset",
    ],
    properties: {
      ...baseProperties,
      suspectDeploymentId: { type: ["string", "null"] },
      correlatedWithIncidentOnset: { type: "boolean" },
    },
  },
} as const;

export const runbookFindingsJsonSchema = {
  name: "sentinelops_runbook_findings",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [...baseRequired, "runbookFound", "recommendedProcedure"],
    properties: {
      ...baseProperties,
      runbookFound: { type: "boolean" },
      recommendedProcedure: { type: ["string", "null"] },
    },
  },
} as const;

export const securityReviewFindingsJsonSchema = {
  name: "sentinelops_security_review_findings",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [...baseRequired, "promptInjectionDetected", "flaggedSources"],
    properties: {
      ...baseProperties,
      promptInjectionDetected: { type: "boolean" },
      flaggedSources: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export const verificationFindingsJsonSchema = {
  name: "sentinelops_verification_findings",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [...baseRequired, "recoveryConfirmed", "residualAnomalies"],
    properties: {
      ...baseProperties,
      recoveryConfirmed: { type: "boolean" },
      residualAnomalies: { type: "array", items: { type: "string" } },
    },
  },
} as const;
