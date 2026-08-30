// Wires the deployment tool contracts to a real McpServer instance. All
// input/output validation happens via each contract's zod schemas, passed
// directly to registerTool (readOnlyHint annotations mark every tool as
// read-only and never mutating — the rollback mutation itself is not
// implemented here).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SystemClock, type Clock } from "../../harness/demo/clock.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import { deploymentToolRegistry } from "./registry.js";

export interface CreateDeploymentServerOptions {
  readonly store?: DemoWorldStore;
  readonly clock?: Clock;
}

export function createDeploymentServer(
  options: CreateDeploymentServerOptions = {},
): McpServer {
  const store = options.store ?? new DemoWorldStore();
  const clock = options.clock ?? new SystemClock();

  const server = new McpServer({
    name: "sentinelops-deployments",
    version: "0.1.0",
  });

  for (const contract of deploymentToolRegistry) {
    server.registerTool(
      contract.name,
      {
        description: contract.description,
        inputSchema: contract.inputSchema,
        outputSchema: contract.outputSchema,
        annotations: {
          title: contract.name,
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      (args: unknown, _extra: unknown) => {
        try {
          const output = contract.execute(args, { store, clock });
          // Safe: outputSchema.parse() just validated `output` against the
          // tool's own declared output schema, which is always a JSON object
          // for every tool in this registry.
          const validated = contract.outputSchema.parse(output) as Record<
            string,
            unknown
          >;
          return {
            structuredContent: validated,
            content: [
              { type: "text" as const, text: JSON.stringify(validated) },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    );
  }

  return server;
}
