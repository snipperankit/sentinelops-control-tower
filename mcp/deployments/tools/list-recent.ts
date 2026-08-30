// deployments.list_recent: lists the most recent deployments for the session
// environment. Read-only; never mutates the demo world.
import { z } from "zod";
import { listDeployments } from "../../../harness/demo/queries.js";
import {
  assertEnvironmentScope,
  loadWorldOrThrow,
  takeMostRecent,
} from "../backend.js";
import type { ToolContract } from "../contract.js";
import { buildProvenance } from "../provenance.js";
import {
  MAX_RESULT_LIMIT,
  deploymentStatusSchema,
  environmentSchema,
  provenanceSchema,
  resultLimitSchema,
} from "../schemas.js";

export const listRecentInputSchema = z.object({
  environment: environmentSchema,
  limit: resultLimitSchema,
});
export type ListRecentInput = z.infer<typeof listRecentInputSchema>;

export const listRecentOutputSchema = z.object({
  deployments: z.array(
    z.object({
      id: z.string(),
      deployedAt: z.string(),
      status: deploymentStatusSchema,
      changeSummary: z.string(),
      checkoutTimeoutMs: z.number(),
      isActive: z.boolean(),
    }),
  ),
  truncated: z.boolean(),
  omittedCount: z.number().int().nonnegative(),
  provenance: provenanceSchema,
});
export type ListRecentOutput = z.infer<typeof listRecentOutputSchema>;

export const listRecentContract: ToolContract<
  ListRecentInput,
  ListRecentOutput
> = {
  name: "deployments.list_recent",
  description:
    "Read-only. Lists the most recent deployments for the session environment, most recent first.",
  inputSchema: listRecentInputSchema,
  outputSchema: listRecentOutputSchema,
  risk: "read-only",
  requiredScope: ["deployments:read"],
  timeoutMs: 2000,
  maxResultItems: MAX_RESULT_LIMIT,
  auditEventType: "deployments.list_recent.invoked",
  execute: (input, { store, clock }) => {
    const world = loadWorldOrThrow(store);
    assertEnvironmentScope(world, input.environment);

    const ascending = listDeployments(store);
    const { items, truncated, omittedCount } = takeMostRecent(
      ascending,
      input.limit,
    );

    return {
      deployments: items
        .map((deployment) => ({
          ...deployment,
          isActive: deployment.id === world.activeDeploymentId,
        }))
        .reverse(),
      truncated,
      omittedCount,
      provenance: buildProvenance(clock, input.environment, world.rolledBack),
    };
  },
};
