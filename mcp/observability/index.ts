#!/usr/bin/env node
// Stdio entrypoint for the observability MCP server. Run via:
//   npm run mcp:observability
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createObservabilityServer } from "./server.js";

async function main(): Promise<void> {
  const server = createObservabilityServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
