// deployments.rollback: performs the simulated rollback mutation for the
// session environment.
//
// This adapter re-verifies preconditions itself (environment scope, current
// deployment freshness, target allowlist/health, idempotent replay) as
// defense-in-depth against a stale or replayed call, but it never decides
// whether the caller was *authorized* to invoke it \u2014 that decision belongs
// entirely to the policy layer (see .github/instructions/policy.instructions.md,
// AGENTS.md "Never allow the UI to bypass this layer"). No approval logic
// lives here.
//
// This contract is deliberately NOT added to `deploymentToolRegistry`
// (mcp/deployments/registry.ts) or wired into `createDeploymentServer()`
// (mcp/deployments/server.ts) \u2014 it is exported only via
// `mutatingDeploymentToolRegistry` (mcp/deployments/mutating-registry.ts) so
// that today, with no policy-gated adapter yet in this repo, it is not
// reachable from the model-facing MCP transport or the frontend at all.
import { z } from "zod";
import type { DeploymentId } from "../../../harness/demo/domain.js";
import type { AuditEvent, AuditSink } from "../audit.js";
import { assertEnvironmentScope, loadWorldOrThrow } from "../backend.js";
import type { ToolContract, ToolDependencies } from "../contract.js";
import {
  CurrentDeploymentMismatchError,
  DuplicateIdempotencyKeyError,
  TargetNotAllowlistedError,
} from "../errors.js";
import type { IdempotencyStore } from "../idempotency.js";
import { buildProvenance } from "../provenance.js";
import {
  deploymentIdSchema,
  environmentSchema,
  provenanceSchema,
  serviceNameSchema,
} from "../schemas.js";

export const rollbackInputSchema = z.object({
  service: serviceNameSchema,
  environment: environmentSchema,
  currentDeploymentId: deploymentIdSchema,
  targetDeploymentId: deploymentIdSchema,
  idempotencyKey: z.string().min(1).max(200),
});
export type RollbackInput = z.infer<typeof rollbackInputSchema>;

export const rollbackOutputSchema = z.object({
  mutated: z.boolean(),
  duplicate: z.boolean(),
  service: serviceNameSchema,
  environment: z.string(),
  fromDeploymentId: z.string(),
  toDeploymentId: z.string(),
  requestedAt: z.string(),
  provenance: provenanceSchema,
});
export type RollbackOutput = z.infer<typeof rollbackOutputSchema>;

export interface RollbackToolDependencies extends ToolDependencies {
  readonly idempotencyStore: IdempotencyStore;
  readonly auditSink: AuditSink;
}

/** Canonicalizes the mutation-relevant arguments (excludes the idempotency key itself) for duplicate-vs-conflict detection. */
function fingerprintOf(input: RollbackInput): string {
  return JSON.stringify({
    service: input.service,
    environment: input.environment,
    currentDeploymentId: input.currentDeploymentId,
    targetDeploymentId: input.targetDeploymentId,
  });
}

export const rollbackContract: ToolContract<
  RollbackInput,
  RollbackOutput,
  RollbackToolDependencies
> = {
  name: "deployments.rollback",
  description:
    "Mutating. Rolls back the active deployment to a healthy, allowlisted target for the session environment. Must only be invoked after policy-layer authorization; never callable directly by the model or the frontend.",
  inputSchema: rollbackInputSchema,
  outputSchema: rollbackOutputSchema,
  risk: "mutating",
  requiredScope: ["deployments:rollback"],
  timeoutMs: 5000,
  maxResultItems: 1,
  auditEventType: "deployments.rollback.invoked",
  execute: (input, { store, clock, idempotencyStore, auditSink }) => {
    const world = loadWorldOrThrow(store);
    assertEnvironmentScope(world, input.environment);

    const fingerprint = fingerprintOf(input);
    const existing = idempotencyStore.get(input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DuplicateIdempotencyKeyError(input.idempotencyKey);
      }
      auditSink.record(buildAuditEvent(clock, input, "duplicate"));
      // Replay the original result, but reflect that this call didn't mutate.
      return { ...(existing.output as RollbackOutput), duplicate: true };
    }

    // Format already validated by deploymentIdSchema; store.getDeployment
    // throws the shared UnknownDeploymentError for a well-formed but
    // nonexistent id \u2014 for both the current and target deployment.
    const current = store.getDeployment(
      input.currentDeploymentId as DeploymentId,
    );
    if (current.id !== world.activeDeploymentId) {
      throw new CurrentDeploymentMismatchError(
        input.currentDeploymentId,
        world.activeDeploymentId,
      );
    }

    const target = store.getDeployment(
      input.targetDeploymentId as DeploymentId,
    );
    if (target.status !== "healthy") {
      throw new TargetNotAllowlistedError(target.id, target.status);
    }

    const record = store.rollbackTo(target.id);
    const rolledBackWorld = loadWorldOrThrow(store);

    const output: RollbackOutput = {
      mutated: true,
      duplicate: false,
      service: input.service,
      environment: input.environment,
      fromDeploymentId: record.fromDeploymentId,
      toDeploymentId: record.toDeploymentId,
      requestedAt: record.requestedAt,
      provenance: buildProvenance(
        clock,
        input.environment,
        rolledBackWorld.rolledBack,
      ),
    };

    idempotencyStore.put(input.idempotencyKey, fingerprint, output);
    auditSink.record(buildAuditEvent(clock, input, "executed"));

    return output;
  },
};

function buildAuditEvent(
  clock: ToolDependencies["clock"],
  input: RollbackInput,
  outcome: "executed" | "duplicate",
): AuditEvent {
  return {
    type: "deployments.rollback.invoked",
    occurredAt: clock.now().toISOString(),
    service: input.service,
    environment: input.environment,
    currentDeploymentId: input.currentDeploymentId,
    targetDeploymentId: input.targetDeploymentId,
    idempotencyKey: input.idempotencyKey,
    outcome,
  };
}
