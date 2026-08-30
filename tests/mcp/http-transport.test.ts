// End-to-end smoke test for the shared HTTP MCP transport wrapper
// (mcp/shared/http-server.ts): starts the incidents server over Streamable
// HTTP on an ephemeral port and drives it with the official MCP SDK client,
// proving the wiring TrueForge would use as a remote connector actually
// works (see harness/agent/spec.ts, harness/README.md).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import { DemoWorldStore } from "../../harness/demo/store.js";
import {
  serveMcpOverHttp,
  type McpHttpHandle,
} from "../../mcp/shared/http-server.js";
import { createIncidentsServer } from "../../mcp/incidents/server.js";

describe("serveMcpOverHttp", () => {
  let tempDir: string | undefined;
  let handle: McpHttpHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("serves incidents.get_runbook over Streamable HTTP to a real MCP client", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-mcp-http-"));
    const clock = new FixedClock(new Date("2026-01-01T01:05:00.000Z"));
    const store = new DemoWorldStore({
      stateFilePath: join(tempDir, "world.json"),
      clock,
    });
    store.seed();

    handle = await serveMcpOverHttp({
      createServer: () => createIncidentsServer({ store, clock }),
      port: 0,
    });

    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${handle.port}/mcp`),
    );
    // Same exactOptionalPropertyTypes/SDK-declaration mismatch as the server
    // transport in mcp/shared/http-server.ts; narrow cast, not a behavior change.
    await client.connect(transport as unknown as Transport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("incidents.get_runbook");

      const result = await client.callTool({
        name: "incidents.get_runbook",
        arguments: { environment: "sentinelops-demo", service: "checkout" },
      });

      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as {
        procedure: { title: string };
      };
      expect(structured.procedure.title).toBe("Checkout deployment rollback");
    } finally {
      await client.close();
    }
  });
});
