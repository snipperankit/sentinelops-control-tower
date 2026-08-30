// deployments.get_rollback_prerequisites: reports whether rolling back to a
// target deployment would be valid for the session environment, without
// performing the rollback. Read-only — the rollback mutation itself is out
// of scope for this tool (see AGENTS.md / PRODUCT_SPEC.md).
import { z } from "zod";
import type { DeploymentId } from "../../../harness/demo/domain.js";
import { assertEnvironmentScope, loadWorldOrThrow } from "../backend.js";
import type { ToolContract } from "../contract.js";
import { buildProvenance } from "../provenance.js";
import {
  deploymentIdSchema,
  deploymentStatusSchema,
  environmentSchema,
  provenanceSchema,
} from "../schemas.js";

export const getRollbackPrerequisitesInputSchema = z.object({
  environment: environmentSchema,
  targetDeploymentId: deploymentIdSchema,
});
export type GetRollbackPrerequisitesInput = z.infer<
  typeof getRollbackPrerequisitesInputSchema
>;

export const getRollbackPrerequisitesOutputSchema = z.object({
  targetDeploymentId: z.string(),
  targetStatus: deploymentStatusSchema,
  activeDeploymentId: z.string(),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
  provenance: provenanceSchema,
});
export type GetRollbackPrerequisitesOutput = z.infer<
  typeof getRollbackPrerequisitesOutputSchema
>;

export const getRollbackPrerequisitesContract: ToolContract<
  GetRollbackPrerequisitesInput,
  GetRollbackPrerequisitesOutput
> = {
  name: "deployments.get_rollback_prerequisites",
  description:
    "Read-only. Reports whether rolling back to a target deployment would be valid for the session environment, without performing the rollback.",
  inputSchema: getRollbackPrerequisitesInputSchema,
  outputSchema: getRollbackPrerequisitesOutputSchema,
  risk: "read-only",
  requiredScope: ["deployments:read"],
  timeoutMs: 2000,
  maxResultItems: 1,
  auditEventType: "deployments.get_rollback_prerequisites.invoked",
  execute: (input, { store, clock }) => {
    const world = loadWorldOrThrow(store);
    assertEnvironmentScope(world, input.environment);

    // Format already validated by deploymentIdSchema; store.getDeployment
    // throws the shared UnknownDeploymentError for a well-formed but
    // nonexistent id.
    const target = store.getDeployment(
      input.targetDeploymentId as DeploymentId,
    );

    // Mirrors DemoWorldStore.rollbackTo()'s guard conditions, but only
    // reports eligibility — it never mutates the world.
    const reasons: string[] = [];
    if (target.id === world.activeDeploymentId) {
      reasons.push("target deployment is already active");
    }
    if (target.status === "rolled-back") {
      reasons.push("target deployment was itself rolled back");
    }

    return {
      targetDeploymentId: target.id,
      targetStatus: target.status,
      activeDeploymentId: world.activeDeploymentId,
      eligible: reasons.length === 0,
      reasons,
      provenance: buildProvenance(clock, input.environment, world.rolledBack),
    };
  },
};
