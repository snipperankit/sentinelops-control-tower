// Registry of mutating deployment MCP tool contracts. Deliberately separate
// from `deploymentToolRegistry` (registry.ts) and NOT wired into
// `createDeploymentServer()` (server.ts): those expose tools directly on the
// model-facing MCP transport, and a mutating tool must never be reachable
// from the frontend or the model without going through the policy layer
// first (see AGENTS.md, .github/instructions/policy.instructions.md).
//
// A future policy-authorized adapter is expected to import
// `rollbackContract` directly and invoke it via `runTool()` only after
// authorization succeeds \u2014 not through this package's stdio MCP server.
import { rollbackContract } from "./tools/rollback.js";

export const mutatingDeploymentToolRegistry = [rollbackContract] as const;
