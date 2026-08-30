// Shared tool-contract type and validation harness for observability MCP
// tools. Every tool must declare its schema, risk classification, scope,
// timeout, result-size limit, and audit event type before implementation
// (see .github/instructions/mcp.instructions.md).
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
  // The third ZodType parameter (the schema's own pre-parse input type) is
  // loosened to `unknown` here: several tool schemas use `.default()`, whose
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
   * contracts such as `ToolContract<GetErrorRatesInput, GetErrorRatesOutput>`
   * remain structurally assignable to the widened
   * `ToolContract<unknown, unknown>` used by the tool registry, without an
   * unsafe cast at the call site (TypeScript checks method parameters
   * bivariantly, arrow-typed properties contravariantly).
   *
   * May return a Promise: every fixture-backed tool resolves synchronously,
   * but `observability.query_grafana` optionally calls a real external
   * Grafana instance and must await a network response.
   */
  execute(input: Input, deps: ToolDependencies): Output | Promise<Output>;
}

/**
 * Validates raw input against the contract's input schema, runs the tool,
 * and validates the result against the contract's output schema. This
 * mirrors what the live MCP server does, exposed as a pure function so
 * contract tests can exercise every tool without a transport.
 *
 * Only safe for contracts whose `execute()` resolves synchronously — every
 * tool in this registry except `observability.query_grafana`. Use
 * `runToolAsync()` for a contract whose `execute()` may return a Promise.
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

  // Safe: this function is only ever called with contracts declared to
  // resolve synchronously (see doc comment above); `runToolAsync()` is the
  // variant for contracts that may return a Promise.
  const output = contract.execute(parsedInput.data, deps) as Output;

  const parsedOutput = contract.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    throw new Error(
      `Tool "${contract.name}" produced output that violates its own output schema: ${parsedOutput.error.message}`,
    );
  }

  return parsedOutput.data;
}

/**
 * Async variant of `runTool()`, for a contract whose `execute()` may return
 * a Promise (currently only `observability.query_grafana`, which optionally
 * calls a real external Grafana instance in live mode). Behaves identically
 * to `runTool()` otherwise.
 */
export async function runToolAsync<Input, Output>(
  contract: ToolContract<Input, Output>,
  rawInput: unknown,
  deps: ToolDependencies,
): Promise<Output> {
  const parsedInput = contract.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new InvalidArgumentsError(
      parsedInput.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }

  const output = await contract.execute(parsedInput.data, deps);

  const parsedOutput = contract.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    throw new Error(
      `Tool "${contract.name}" produced output that violates its own output schema: ${parsedOutput.error.message}`,
    );
  }

  return parsedOutput.data;
}
