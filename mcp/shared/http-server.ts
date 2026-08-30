// Generic HTTP transport wrapper shared by every read-only MCP server in
// this repo, so each can be registered as a TrueForge `remote` MCP
// connector (TrueForge only supports remote/URL-based MCP connectors — see
// harness/README.md). This is intentionally generic transport plumbing
// (not domain logic), so it lives once in mcp/shared/ rather than being
// duplicated per server.
//
// A fresh McpServer + StreamableHTTPServerTransport pair is created for
// EVERY request. This is the SDK's documented pattern for stateless mode
// (sessionIdGenerator omitted): the underlying Protocol class refuses a
// second connect() on an already-connected instance ("Already connected to
// a transport... use a separate Protocol instance per connection"), so a
// single long-lived transport cannot serve more than one request. Each of
// this repo's MCP servers is cheap to construct (an in-memory tool
// registry over the demo world store), so this has no meaningful cost.
import { createServer, type Server } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface ServeMcpOverHttpOptions {
  /** Builds a fresh, unconnected McpServer instance for a single request. */
  readonly createServer: () => McpServer;
  readonly port: number;
  /** HTTP path the MCP endpoint is served on. Default: "/mcp". */
  readonly path?: string;
}

export interface McpHttpHandle {
  readonly port: number;
  close(): Promise<void>;
}

export async function serveMcpOverHttp(
  options: ServeMcpOverHttpOptions,
): Promise<McpHttpHandle> {
  const path = options.path ?? "/mcp";

  const httpServer: Server = createServer((req, res) => {
    if (req.url !== path) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }

    void handleStatelessRequest(options.createServer(), req, res).catch(
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" }).end(message);
        }
      },
    );
  });

  const boundPort = await new Promise<number>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, () => {
      const address = httpServer.address();
      resolve(
        typeof address === "object" && address ? address.port : options.port,
      );
    });
  });

  return {
    port: boundPort,
    async close() {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function handleStatelessRequest(
  server: McpServer,
  req: Parameters<StreamableHTTPServerTransport["handleRequest"]>[0],
  res: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1],
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({});
  res.once("close", () => {
    void transport.close();
    void server.close();
  });

  // StreamableHTTPServerTransport's onclose/onerror/onmessage accessors are
  // typed `(() => void) | undefined`, which doesn't structurally satisfy
  // Transport's `exactOptionalPropertyTypes`-checked optional fields even
  // though the class declares `implements Transport`. Narrow cast, not a
  // behavior change.
  await server.connect(transport as unknown as Transport);
  await transport.handleRequest(req, res);
}
