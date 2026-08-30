// Shared zod schemas for the incidents MCP server: session-environment
// scope, service names, and the provenance envelope every tool response
// must include (mirrors mcp/deployments/schemas.ts).
import { z } from "zod";
import { SERVICE_NAMES } from "../../harness/demo/domain.js";

/** Every tool call must be scoped to the session's demo environment (see backend.ts assertEnvironmentScope). */
export const environmentSchema = z.string().min(1, "environment is required");

export const serviceNameSchema = z.enum(SERVICE_NAMES);

export const provenanceSchema = z.object({
  source: z.literal("sentinelops-runbook-catalog"),
  environment: z.string(),
  retrievedAt: z.string(),
});
