#!/usr/bin/env node
// Stdio entrypoint for the context MCP server. Run via:
//   npm run mcp:context
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContextServer } from "./server.js";

async function main(): Promise<void> {
  const server = createContextServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
