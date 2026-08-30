#!/usr/bin/env node
// HTTP entrypoint for the deployment MCP server (npm run mcp:deployments:http).
// createDeploymentServer() only ever registers `deploymentToolRegistry`
// (read-only tools) — the mutating rollback tool lives exclusively in
// mcp/deployments/mutating-registry.ts and is never imported here, so it
// remains structurally unreachable over this (or any) MCP transport. See
// mcp/deployments/server.ts and mcp/README.md.
import { serveMcpOverHttp } from "../shared/http-server.js";
import { createDeploymentServer } from "./server.js";

const port = Number(process.env.MCP_DEPLOYMENTS_HTTP_PORT ?? "8802");

async function main(): Promise<void> {
  const handle = await serveMcpOverHttp({
    createServer: createDeploymentServer,
    port,
  });
  console.error(
    `sentinelops-deployments MCP server listening on http://localhost:${handle.port}/mcp`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "Failed to start sentinelops-deployments HTTP MCP server:",
    error,
  );
  process.exitCode = 1;
});
