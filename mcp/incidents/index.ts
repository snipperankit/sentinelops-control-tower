#!/usr/bin/env node
// Stdio entrypoint for the incidents MCP server (npm run mcp:incidents).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createIncidentsServer } from "./server.js";

async function main(): Promise<void> {
  const server = createIncidentsServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Failed to start sentinelops-incidents MCP server:", error);
  process.exitCode = 1;
});
