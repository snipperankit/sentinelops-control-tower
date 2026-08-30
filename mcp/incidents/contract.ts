// Shared tool-contract type and validation harness for the incidents MCP
// server, mirroring mcp/deployments/contract.ts's pattern (each server owns
// its own copy of this small local infra; see mcp/README.md).
import type { z } from "zod";
import type { Clock } from "../../harness/demo/clock.js";
import type { DemoWorldStore } from "../../harness/demo/store.js";
import { InvalidArgumentsError } from "./errors.js";

export type RiskClassification = "read-only" | "mutating";

export interface ToolDependencies {
  readonly store: DemoWorldStore;
  readonly clock: Clock;
}

export interface ToolContract<Input, Output> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input, z.ZodTypeDef, unknown>;
  readonly outputSchema: z.ZodType<Output, z.ZodTypeDef, unknown>;
  readonly risk: RiskClassification;
  readonly requiredScope: readonly string[];
  readonly timeoutMs: number;
  readonly maxResultItems: number;
  readonly auditEventType: string;
  execute(input: Input, deps: ToolDependencies): Output;
}

/**
 * Validates raw input against the contract's input schema, runs the tool,
 * and validates the result against the contract's output schema — exposed
 * as a pure function so contract tests can exercise every tool without a
 * transport.
 */
export function runTool<Input, Output>(
  contract: ToolContract<Input, Output>,
  rawInput: unknown,
  deps: ToolDependencies,
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
