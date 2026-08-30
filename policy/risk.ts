// Tool risk classification and allowlist. Only tools explicitly registered
// here may be invoked; unknown tools are denied (SECURITY.md invariant 7,
// THREAT_MODEL.md "Tool schema confusion"). The allowlist is the single
// source of truth for which tools exist and whether they require approval.
import type { RiskLevel, ToolRiskEntry } from "./types.js";
import { UnknownToolError } from "./errors.js";

const TOOL_REGISTRY: readonly ToolRiskEntry[] = [
  // --- read-only observability tools ---
  {
    toolName: "observability.get_error_rates",
    risk: "read-only",
    requiredScope: ["observability:read"],
  },
  {
    toolName: "observability.get_latency",
    risk: "read-only",
    requiredScope: ["observability:read"],
  },
  {
    toolName: "observability.search_logs",
    risk: "read-only",
    requiredScope: ["observability:read"],
  },
  {
    toolName: "observability.query_traces",
    risk: "read-only",
    requiredScope: ["observability:read"],
  },
  // --- read-only deployment tools ---
  {
    toolName: "deployments.list_recent",
    risk: "read-only",
    requiredScope: ["deployments:read"],
  },
  {
    toolName: "deployments.get_diff",
    risk: "read-only",
    requiredScope: ["deployments:read"],
  },
  {
    toolName: "deployments.get_health",
    risk: "read-only",
    requiredScope: ["deployments:read"],
  },
  {
    toolName: "deployments.get_rollback_prerequisites",
    risk: "read-only",
    requiredScope: ["deployments:read"],
  },
  // --- read-only incidents/runbook tools ---
  {
    toolName: "incidents.get_runbook",
    risk: "read-only",
    requiredScope: ["incidents:read"],
  },
  // --- read-only external-context tools (GitHub/Bitbucket/web search) ---
  {
    toolName: "context.get_github_pull_request",
    risk: "read-only",
    requiredScope: ["context:read"],
  },
  {
    toolName: "context.get_bitbucket_pull_request",
    risk: "read-only",
    requiredScope: ["context:read"],
  },
  {
    toolName: "context.search_web",
    risk: "read-only",
    requiredScope: ["context:read"],
  },
  // --- mutating tools ---
  {
    toolName: "deployments.rollback",
    risk: "mutating",
    requiredScope: ["deployments:rollback"],
  },
  {
    toolName: "slack.postMessage",
    risk: "mutating",
    requiredScope: ["slack:post"],
  },
  {
    toolName: "mail.send",
    risk: "mutating",
    requiredScope: ["mail:send"],
  },
];

const TOOL_MAP = new Map<string, ToolRiskEntry>(
  TOOL_REGISTRY.map((entry) => [entry.toolName, entry]),
);

export function classifyToolRisk(toolName: string): ToolRiskEntry {
  const entry = TOOL_MAP.get(toolName);
  if (!entry) {
    throw new UnknownToolError(toolName);
  }
  return entry;
}

export function isToolAllowed(toolName: string): boolean {
  return TOOL_MAP.has(toolName);
}

export function requiresApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === "mutating" || riskLevel === "destructive";
}

export function listAllowedTools(): readonly ToolRiskEntry[] {
  return TOOL_REGISTRY;
}
