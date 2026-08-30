// Registry of every deployment MCP tool contract. server.ts wires each entry
// to McpServer.registerTool(); tests exercise contracts directly via
// contract.ts's runTool() without a transport.
import type { ToolContract } from "./contract.js";
import { getDiffContract } from "./tools/get-diff.js";
import { getHealthContract } from "./tools/get-health.js";
import { getRollbackPrerequisitesContract } from "./tools/get-rollback-prerequisites.js";
import { listRecentContract } from "./tools/list-recent.js";

export const deploymentToolRegistry: readonly ToolContract<unknown, unknown>[] =
  [
    listRecentContract,
    getDiffContract,
    getHealthContract,
    getRollbackPrerequisitesContract,
  ];
