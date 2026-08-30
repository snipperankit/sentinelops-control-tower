// Wires the incidents tool contracts to a real McpServer instance. All
// input/output validation happens via each contract's zod schemas, passed
// directly to registerTool (readOnlyHint annotations mark every tool as
// read-only and never mutating).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SystemClock, type Clock } from "../../harness/demo/clock.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import { incidentsToolRegistry } from "./registry.js";

export interface CreateIncidentsServerOptions {
  readonly store?: DemoWorldStore;
  readonly clock?: Clock;
}

export function createIncidentsServer(
  options: CreateIncidentsServerOptions = {},
): McpServer {
  const store = options.store ?? new DemoWorldStore();
  const clock = options.clock ?? new SystemClock();

  const server = new McpServer({
    name: "sentinelops-incidents",
    version: "0.1.0",
  });

  for (const contract of incidentsToolRegistry) {
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
