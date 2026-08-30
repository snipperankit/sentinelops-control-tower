#!/usr/bin/env node
// Stdio entrypoint for the deployment MCP server (npm run mcp:deployments).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDeploymentServer } from "./server.js";

async function main(): Promise<void> {
  const server = createDeploymentServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Failed to start sentinelops-deployments MCP server:", error);
  process.exitCode = 1;
});
