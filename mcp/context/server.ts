// Wires the context tool contracts (GitHub/Bitbucket PR lookup, web search)
// to a real McpServer instance. All input/output validation happens via
// each contract's zod schemas; every tool is annotated read-only.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SystemClock, type Clock } from "../../harness/demo/clock.js";
import { contextToolRegistry } from "./registry.js";

export interface CreateContextServerOptions {
  readonly clock?: Clock;
}

export function createContextServer(
  options: CreateContextServerOptions = {},
): McpServer {
  const clock = options.clock ?? new SystemClock();

  const server = new McpServer({
    name: "sentinelops-context",
    version: "0.1.0",
  });

  for (const contract of contextToolRegistry) {
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
          openWorldHint: true,
        },
      },
      async (args: unknown, _extra: unknown) => {
        try {
          const output = await contract.execute(args, { clock });
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
