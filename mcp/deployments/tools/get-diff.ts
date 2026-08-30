// deployments.get_diff: returns a deployment and its diff against the
// immediately preceding deployment for the session environment. Read-only.
import { z } from "zod";
import type { DeploymentId } from "../../../harness/demo/domain.js";
import { getDeploymentDiff } from "../../../harness/demo/queries.js";
import { assertEnvironmentScope, loadWorldOrThrow } from "../backend.js";
import type { ToolContract } from "../contract.js";
import { buildProvenance } from "../provenance.js";
import {
  deploymentIdSchema,
  deploymentStatusSchema,
  environmentSchema,
  provenanceSchema,
} from "../schemas.js";

export const getDiffInputSchema = z.object({
  environment: environmentSchema,
  deploymentId: deploymentIdSchema,
});
export type GetDiffInput = z.infer<typeof getDiffInputSchema>;

const deploymentSummarySchema = z.object({
  id: z.string(),
  deployedAt: z.string(),
  status: deploymentStatusSchema,
  changeSummary: z.string(),
  checkoutTimeoutMs: z.number(),
});

export const getDiffOutputSchema = z.object({
  deployment: deploymentSummarySchema,
  previous: deploymentSummarySchema.optional(),
  checkoutTimeoutMsDelta: z.number().optional(),
  provenance: provenanceSchema,
});
export type GetDiffOutput = z.infer<typeof getDiffOutputSchema>;

export const getDiffContract: ToolContract<GetDiffInput, GetDiffOutput> = {
  name: "deployments.get_diff",
  description:
    "Read-only. Returns a deployment and its diff against the immediately preceding deployment for the session environment.",
  inputSchema: getDiffInputSchema,
  outputSchema: getDiffOutputSchema,
  risk: "read-only",
  requiredScope: ["deployments:read"],
  timeoutMs: 2000,
  maxResultItems: 1,
  auditEventType: "deployments.get_diff.invoked",
  execute: (input, { store, clock }) => {
    const world = loadWorldOrThrow(store);
    assertEnvironmentScope(world, input.environment);

    // Format already validated by deploymentIdSchema; existence is checked
    // by getDeploymentDiff, which throws the shared UnknownDeploymentError
    // (harness/demo/domain.js) for a well-formed but nonexistent id.
    const diff = getDeploymentDiff(store, input.deploymentId as DeploymentId);

    return {
      deployment: diff.deployment,
      ...(diff.previous && {
        previous: diff.previous,
        checkoutTimeoutMsDelta: diff.checkoutTimeoutMsDelta,
      }),
      provenance: buildProvenance(clock, input.environment, world.rolledBack),
    };
  },
};
