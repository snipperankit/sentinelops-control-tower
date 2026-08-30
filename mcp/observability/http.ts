#!/usr/bin/env node
// HTTP entrypoint for the observability MCP server (npm run mcp:observability:http).
// Exposes the same read-only tool set as index.ts's stdio transport, over
// Streamable HTTP, so it can be registered as a TrueForge remote MCP
// connector (see mcp/shared/http-server.ts, harness/agent/spec.ts).
import { serveMcpOverHttp } from "../shared/http-server.js";
import { createObservabilityServer } from "./server.js";

const port = Number(process.env.MCP_OBSERVABILITY_HTTP_PORT ?? "8801");

async function main(): Promise<void> {
  const handle = await serveMcpOverHttp({
    createServer: createObservabilityServer,
    port,
  });
  console.error(
    `sentinelops-observability MCP server listening on http://localhost:${handle.port}/mcp`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "Failed to start sentinelops-observability HTTP MCP server:",
    error,
  );
  process.exitCode = 1;
});
