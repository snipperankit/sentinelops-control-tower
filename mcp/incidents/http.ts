#!/usr/bin/env node
// HTTP entrypoint for the incidents (runbook) MCP server (npm run mcp:incidents:http).
import { serveMcpOverHttp } from "../shared/http-server.js";
import { createIncidentsServer } from "./server.js";

const port = Number(process.env.MCP_INCIDENTS_HTTP_PORT ?? "8803");

async function main(): Promise<void> {
  const handle = await serveMcpOverHttp({
    createServer: createIncidentsServer,
    port,
  });
  console.error(
    `sentinelops-incidents MCP server listening on http://localhost:${handle.port}/mcp`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "Failed to start sentinelops-incidents HTTP MCP server:",
    error,
  );
  process.exitCode = 1;
});
