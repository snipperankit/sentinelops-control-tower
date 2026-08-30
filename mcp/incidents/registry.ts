// Registry of every incidents MCP tool contract. server.ts wires each entry
// to McpServer.registerTool(); tests exercise contracts directly via
// contract.ts's runTool() without a transport.
import type { ToolContract } from "./contract.js";
import { getRunbookContract } from "./tools/get-runbook.js";

export const incidentsToolRegistry: readonly ToolContract<unknown, unknown>[] =
  [getRunbookContract];
