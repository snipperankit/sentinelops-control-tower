#!/usr/bin/env node
// HTTP entrypoint for the context MCP server (npm run mcp:context:http).
// Exposes the same read-only tool set as index.ts's stdio transport, over
// Streamable HTTP, so it can be registered as a TrueForge remote MCP
// connector (see mcp/shared/http-server.ts, harness/agent/specialists.ts).
import { serveMcpOverHttp } from "../shared/http-server.js";
import { createContextServer } from "./server.js";

const port = Number(process.env.MCP_CONTEXT_HTTP_PORT ?? "8804");

async function main(): Promise<void> {
  const handle = await serveMcpOverHttp({
    createServer: createContextServer,
    port,
  });
  console.error(
    `sentinelops-context MCP server listening on http://localhost:${handle.port}/mcp`,
  );
}

main().catch((error: unknown) => {
  console.error("Failed to start sentinelops-context HTTP MCP server:", error);
  process.exitCode = 1;
});
