// Builds the five bounded specialist agent specs (see ARCHITECTURE.md
// "Agent boundaries", AGENTS.md). Mirrors spec.ts's commander pattern but
// each specialist:
//
// - Is attached to a narrow, explicit, literal tool allowlist (never
//   `@all`/`@write`/`@destructive`, and never another specialist's tools).
// - Never enables `dynamicSubAgents` — structurally cannot delegate
//   further (see delegation.ts's DelegationLimits.maxDepth).
// - Has its own typed response schema (specialist-result-schema.ts).
//
// SAFETY INVARIANT: no specialist spec here may ever reference a
// mutation-capable tool (e.g. "deployments.rollback") or a `@write`/
// `@destructive`/`@all` selector. `tests/unit/specialist-specs.test.ts`
// asserts this for every spec.
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import {
  deploymentFindingsJsonSchema,
  observabilityFindingsJsonSchema,
  runbookFindingsJsonSchema,
  securityReviewFindingsJsonSchema,
  verificationFindingsJsonSchema,
} from "./specialist-result-schema.js";

/** Smaller than the commander's default (25): each specialist performs one narrow task, not a full investigation. */
export const DEFAULT_SPECIALIST_ITERATION_LIMIT = 10;

export const OBSERVABILITY_INVESTIGATOR_NAME =
  "sentinelops-observability-investigator";
export const DEPLOYMENT_INVESTIGATOR_NAME =
  "sentinelops-deployment-investigator";
export const RUNBOOK_INVESTIGATOR_NAME = "sentinelops-runbook-investigator";
export const SECURITY_REVIEWER_NAME = "sentinelops-security-reviewer";
export const VERIFICATION_AGENT_NAME = "sentinelops-verification-agent";

export const OBSERVABILITY_INVESTIGATOR_SKILL = "observability-analysis";
export const DEPLOYMENT_INVESTIGATOR_SKILL = "deployment-analysis";
export const RUNBOOK_INVESTIGATOR_SKILL = "runbook-lookup";
export const SECURITY_REVIEWER_SKILL = "security-review";
export const VERIFICATION_AGENT_SKILL = "verification";

/** Explicit literal tool names, not the `@read-only` selector — a tighter, per-specialist allowlist than the commander's per-connector one. */
export const OBSERVABILITY_INVESTIGATOR_TOOLS = [
  "observability.get_error_rates",
  "observability.get_latency",
  "observability.search_logs",
  "observability.query_traces",
  "observability.query_grafana",
] as const;

/** Never includes "deployments.rollback" — that tool is not even registered on the read-only connector (see mcp/deployments/mutating-registry.ts). */
export const DEPLOYMENT_INVESTIGATOR_TOOLS = [
  "deployments.list_recent",
  "deployments.get_diff",
  "deployments.get_health",
  "deployments.get_rollback_prerequisites",
] as const;

/** External-context tools (GitHub/Bitbucket PR lookup, web search) — a second, independent MCP connector attached to the deployment investigator alongside DEPLOYMENT_INVESTIGATOR_TOOLS. */
export const DEPLOYMENT_INVESTIGATOR_CONTEXT_TOOLS = [
  "context.get_github_pull_request",
  "context.get_bitbucket_pull_request",
  "context.search_web",
] as const;

export const RUNBOOK_INVESTIGATOR_TOOLS = ["incidents.get_runbook"] as const;

/** The security reviewer inspects evidence already gathered by other specialists; it has no MCP tool of its own. */
export const SECURITY_REVIEWER_TOOLS = [] as const;

/** Read-only recovery-check tools only, narrower than the deployment investigator's full set. */
export const VERIFICATION_AGENT_OBSERVABILITY_TOOLS = [
  "observability.get_error_rates",
  "observability.get_latency",
] as const;
export const VERIFICATION_AGENT_DEPLOYMENT_TOOLS = [
  "deployments.get_health",
] as const;

function buildRestrictedMcpServer(
  name: string,
  allowedTools: readonly string[],
): TrueForgeApi.McpServer {
  return {
    name,
    enableTools: [...allowedTools],
    requireApprovalForTools: [],
  };
}

interface BaseSpecialistSpecOptions {
  readonly model: string;
  readonly instructions: string;
  readonly iterationLimit?: number;
}

function buildSpecialistConfig(
  iterationLimit: number | undefined,
): TrueForgeApi.RuntimeConfig {
  return {
    sandbox: { enabled: true },
    // No dynamicSubAgents: specialists cannot spawn further sub-agents at
    // all (bounded delegation depth = 1, enforced structurally here and
    // tracked at runtime by delegation.ts's DelegationTracker).
    askUserQuestions: { enabled: false },
    contextManagement: { compaction: { enabled: true } },
    iterationLimit: iterationLimit ?? DEFAULT_SPECIALIST_ITERATION_LIMIT,
  };
}

export interface ObservabilityInvestigatorSpecOptions extends BaseSpecialistSpecOptions {
  readonly mcpServerName: string;
}

export function buildObservabilityInvestigatorAgentSpec(
  options: ObservabilityInvestigatorSpecOptions,
): TrueForgeApi.AgentSpec {
  return {
    model: { name: options.model },
    instructions: options.instructions,
    mcpServers: [
      buildRestrictedMcpServer(
        options.mcpServerName,
        OBSERVABILITY_INVESTIGATOR_TOOLS,
      ),
    ],
    skills: [{ name: OBSERVABILITY_INVESTIGATOR_SKILL }],
    config: buildSpecialistConfig(options.iterationLimit),
    responseFormat: {
      type: "json_schema",
      jsonSchema: observabilityFindingsJsonSchema,
    },
  };
}

export interface DeploymentInvestigatorSpecOptions extends BaseSpecialistSpecOptions {
  readonly mcpServerName: string;
  /** Configured name of the context remote MCP connector (GitHub/Bitbucket/web search) — omit to leave the investigator without external-context tools. */
  readonly contextMcpServerName?: string;
}

export function buildDeploymentInvestigatorAgentSpec(
  options: DeploymentInvestigatorSpecOptions,
): TrueForgeApi.AgentSpec {
  return {
    model: { name: options.model },
    instructions: options.instructions,
    mcpServers: [
      buildRestrictedMcpServer(
        options.mcpServerName,
        DEPLOYMENT_INVESTIGATOR_TOOLS,
      ),
      ...(options.contextMcpServerName !== undefined
        ? [
            buildRestrictedMcpServer(
              options.contextMcpServerName,
              DEPLOYMENT_INVESTIGATOR_CONTEXT_TOOLS,
            ),
          ]
        : []),
    ],
    skills: [{ name: DEPLOYMENT_INVESTIGATOR_SKILL }],
    config: buildSpecialistConfig(options.iterationLimit),
    responseFormat: {
      type: "json_schema",
      jsonSchema: deploymentFindingsJsonSchema,
    },
  };
}

export interface RunbookInvestigatorSpecOptions extends BaseSpecialistSpecOptions {
  readonly mcpServerName: string;
}

export function buildRunbookInvestigatorAgentSpec(
  options: RunbookInvestigatorSpecOptions,
): TrueForgeApi.AgentSpec {
  return {
    model: { name: options.model },
    instructions: options.instructions,
    mcpServers: [
      buildRestrictedMcpServer(
        options.mcpServerName,
        RUNBOOK_INVESTIGATOR_TOOLS,
      ),
    ],
    skills: [{ name: RUNBOOK_INVESTIGATOR_SKILL }],
    config: buildSpecialistConfig(options.iterationLimit),
    responseFormat: {
      type: "json_schema",
      jsonSchema: runbookFindingsJsonSchema,
    },
  };
}

export type SecurityReviewerSpecOptions = BaseSpecialistSpecOptions;

/** No `mcpServers` at all: the security reviewer inspects evidence handed to it, it never calls a tool. */
export function buildSecurityReviewerAgentSpec(
  options: SecurityReviewerSpecOptions,
): TrueForgeApi.AgentSpec {
  return {
    model: { name: options.model },
    instructions: options.instructions,
    mcpServers: [],
    skills: [{ name: SECURITY_REVIEWER_SKILL }],
    config: buildSpecialistConfig(options.iterationLimit),
    responseFormat: {
      type: "json_schema",
      jsonSchema: securityReviewFindingsJsonSchema,
    },
  };
}

export interface VerificationAgentSpecOptions extends BaseSpecialistSpecOptions {
  readonly observabilityMcpServerName: string;
  readonly deploymentsMcpServerName: string;
}

export function buildVerificationAgentSpec(
  options: VerificationAgentSpecOptions,
): TrueForgeApi.AgentSpec {
  return {
    model: { name: options.model },
    instructions: options.instructions,
    mcpServers: [
      buildRestrictedMcpServer(
        options.observabilityMcpServerName,
        VERIFICATION_AGENT_OBSERVABILITY_TOOLS,
      ),
      buildRestrictedMcpServer(
        options.deploymentsMcpServerName,
        VERIFICATION_AGENT_DEPLOYMENT_TOOLS,
      ),
    ],
    skills: [{ name: VERIFICATION_AGENT_SKILL }],
    config: buildSpecialistConfig(options.iterationLimit),
    responseFormat: {
      type: "json_schema",
      jsonSchema: verificationFindingsJsonSchema,
    },
  };
}
