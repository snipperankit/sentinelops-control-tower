// Shared tool-contract type and validation harness for context MCP tools
// (GitHub PR lookup, Bitbucket PR lookup, web search) — the deployment
// investigator's read-only "external context" toolset. Independent of
// mcp/observability/contract.ts and mcp/deployments/contract.ts (each MCP
// domain owns its own copy; see .github/instructions/mcp.instructions.md).
//
// These tools never touch the deterministic demo world (no DemoWorldStore
// dependency) since GitHub/Bitbucket/web search are external SaaS APIs, not
// part of the incident's simulated world.
import type { z } from "zod";
import type { Clock } from "../../harness/demo/clock.js";
import { InvalidArgumentsError } from "./errors.js";

export type RiskClassification = "read-only";

export interface ToolDependencies {
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
  readonly auditEventType: string;
  /** May resolve asynchronously: every context tool calls a real external API in live mode. */
  execute(input: Input, deps: ToolDependencies): Output | Promise<Output>;
}

/**
 * Validates raw input against the contract's input schema, awaits the
 * tool's execution, and validates the result against the contract's output
 * schema. Exposed as a pure async function so contract tests can exercise
 * every tool without a transport.
 */
export async function runTool<Input, Output>(
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
