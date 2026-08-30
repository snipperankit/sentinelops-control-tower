// Registry of every observability MCP tool contract. server.ts wires each
// entry to McpServer.registerTool(); tests exercise contracts directly via
// contract.ts's runTool() without a transport.
import type { ToolContract } from "./contract.js";
import { getErrorRatesContract } from "./tools/get-error-rates.js";
import { getLatencyContract } from "./tools/get-latency.js";
import { queryGrafanaContract } from "./tools/query-grafana.js";
import { queryTracesContract } from "./tools/query-traces.js";
import { searchLogsContract } from "./tools/search-logs.js";

export const observabilityToolRegistry: readonly ToolContract<
  unknown,
  unknown
>[] = [
  getErrorRatesContract,
  getLatencyContract,
  searchLogsContract,
  queryTracesContract,
  queryGrafanaContract,
];
