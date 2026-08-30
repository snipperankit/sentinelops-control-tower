// deployments.get_health: reports a deployment's recorded health status and
// metadata freshness for the session environment. Read-only.
import { z } from "zod";
import type { DeploymentId } from "../../../harness/demo/domain.js";
import { assertEnvironmentScope, loadWorldOrThrow } from "../backend.js";
import type { ToolContract } from "../contract.js";
import { buildProvenance, isStale } from "../provenance.js";
import {
  deploymentIdSchema,
  deploymentStatusSchema,
  environmentSchema,
  provenanceSchema,
} from "../schemas.js";

export const getHealthInputSchema = z.object({
  environment: environmentSchema,
  deploymentId: deploymentIdSchema,
});
export type GetHealthInput = z.infer<typeof getHealthInputSchema>;

export const getHealthOutputSchema = z.object({
  deploymentId: z.string(),
  status: deploymentStatusSchema,
  isActive: z.boolean(),
  deployedAt: z.string(),
  ageMs: z.number().int().nonnegative(),
  stale: z.boolean(),
  provenance: provenanceSchema,
});
export type GetHealthOutput = z.infer<typeof getHealthOutputSchema>;

export const getHealthContract: ToolContract<GetHealthInput, GetHealthOutput> =
  {
    name: "deployments.get_health",
    description:
      "Read-only. Reports a deployment's recorded health status and metadata freshness for the session environment.",
    inputSchema: getHealthInputSchema,
    outputSchema: getHealthOutputSchema,
    risk: "read-only",
    requiredScope: ["deployments:read"],
    timeoutMs: 2000,
    maxResultItems: 1,
    auditEventType: "deployments.get_health.invoked",
    execute: (input, { store, clock }) => {
      const world = loadWorldOrThrow(store);
      assertEnvironmentScope(world, input.environment);

      // Format already validated by deploymentIdSchema; store.getDeployment
      // throws the shared UnknownDeploymentError for a well-formed but
      // nonexistent id.
      const deployment = store.getDeployment(
        input.deploymentId as DeploymentId,
      );
      const ageMs = clock.now().getTime() - Date.parse(deployment.deployedAt);

      return {
        deploymentId: deployment.id,
        status: deployment.status,
        isActive: deployment.id === world.activeDeploymentId,
        deployedAt: deployment.deployedAt,
        ageMs,
        stale: isStale(clock, deployment.deployedAt),
        provenance: buildProvenance(clock, input.environment, world.rolledBack),
      };
    },
  };
