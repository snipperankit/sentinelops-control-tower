// Shared tool-contract type and validation harness for deployment MCP tools.
// Every tool must declare its schema, risk classification, scope, timeout,
// result-size limit, and audit event type before implementation (see
// .github/instructions/mcp.instructions.md).
import type { z } from "zod";
import type { Clock } from "../../harness/demo/clock.js";
import type { DemoWorldStore } from "../../harness/demo/store.js";
import { InvalidArgumentsError } from "./errors.js";

export type RiskClassification = "read-only" | "mutating";

export interface ToolDependencies {
  readonly store: DemoWorldStore;
  readonly clock: Clock;
}

export interface ToolContract<
  Input,
  Output,
  Deps extends ToolDependencies = ToolDependencies,
> {
  readonly name: string;
  readonly description: string;
  // The third ZodType parameter (the schema's own pre-parse input type) is
  // loosened to `unknown` here: `resultLimitSchema` uses `.default()`, whose
  // pre-parse input differs from its parsed output (our `Input`/`Output`).
  readonly inputSchema: z.ZodType<Input, z.ZodTypeDef, unknown>;
  readonly outputSchema: z.ZodType<Output, z.ZodTypeDef, unknown>;
  readonly risk: RiskClassification;
  readonly requiredScope: readonly string[];
  /** Declared per-call timeout budget in milliseconds (contract metadata; enforced by the transport/adapter, not this local fixture backend). */
  readonly timeoutMs: number;
  readonly maxResultItems: number;
  readonly auditEventType: string;
  /**
   * Declared as a method (not an arrow-typed property) so that concrete
   * contracts remain structurally assignable to the widened
   * `ToolContract<unknown, unknown>` used by the tool registry, without an
   * unsafe cast at the call site (TypeScript checks method parameters
   * bivariantly, arrow-typed properties contravariantly).
   */
  execute(input: Input, deps: Deps): Output;
}

/**
 * Validates raw input against the contract's input schema, runs the tool,
 * and validates the result against the contract's output schema. This
 * mirrors what the live MCP server does, exposed as a pure function so
 * contract tests can exercise every tool without a transport.
 */
export function runTool<
  Input,
  Output,
  Deps extends ToolDependencies = ToolDependencies,
>(
  contract: ToolContract<Input, Output, Deps>,
  rawInput: unknown,
  deps: Deps,
): Output {
  const parsedInput = contract.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new InvalidArgumentsError(
      parsedInput.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }

  const output = contract.execute(parsedInput.data, deps);

  const parsedOutput = contract.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    throw new Error(
      `Tool "${contract.name}" produced output that violates its own output schema: ${parsedOutput.error.message}`,
    );
  }

  return parsedOutput.data;
}
