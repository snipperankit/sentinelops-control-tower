// Shared zod schemas for the deployment MCP tools: session-environment scope,
// deployment-identifier format validation, result limits, and the provenance
// envelope every tool response must include.
import { z } from "zod";
import { SERVICE_NAMES } from "../../harness/demo/domain.js";

export const DEFAULT_RESULT_LIMIT = 20;
export const MAX_RESULT_LIMIT = 100;

/** Every tool call must be scoped to the session's demo environment (see backend.ts assertEnvironmentScope). */
export const environmentSchema = z.string().min(1, "environment is required");

export const serviceNameSchema = z.enum(SERVICE_NAMES);

/**
 * Validates that a deployment identifier is well-formed (e.g. "4c21")
 * without requiring it to already exist. A well-formed but nonexistent id
 * (e.g. "4c99") is rejected downstream as a typed `UnknownDeploymentError`,
 * keeping "malformed identifier" and "unknown deployment" as distinct,
 * separately testable failure modes.
 */
export const deploymentIdSchema = z
  .string()
  .regex(/^4c[0-9]{2}$/, "must be a well-formed deployment id (e.g. 4c21)");

export const resultLimitSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_RESULT_LIMIT)
  .default(DEFAULT_RESULT_LIMIT);

export const deploymentStatusSchema = z.enum([
  "healthy",
  "suspect",
  "rolled-back",
]);

export const provenanceSchema = z.object({
  source: z.literal("sentinelops-demo-world"),
  environment: z.string(),
  retrievedAt: z.string(),
  worldRolledBack: z.boolean(),
});
