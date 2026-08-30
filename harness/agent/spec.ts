// Builds the versioned "commander" TrueForge agent spec: model from env,
// the versioned system prompt (agents/commander/system-prompt.v1.md), MCP
// connectors restricted to read-only tool selectors, the
// incident-investigation skill, bounded iteration/delegation config, and
// the structured investigation-result response format.
//
// SAFETY INVARIANT: this module must never accept or attach a
// rollback-capable MCP connector. This repo has no policy gateway yet
// (policy/README.md is a placeholder), so per AGENTS.md / the Phase 3
// requirement ("do not connect rollback yet unless it is routed through the
// policy gateway"), rollback is not connected in this phase at all — there
// is no gateway to route it through. `CommanderAgentSpecOptions` only
// accepts connector names for observability, deployments, and incidents,
// each hard-restricted to `@read-only` tools.
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { investigationResultJsonSchema } from "./result-schema.js";

export const COMMANDER_AGENT_NAME = "sentinelops-commander";
export const COMMANDER_SYSTEM_PROMPT_VERSION = "v1";
export const COMMANDER_SKILL_NAME = "incident-investigation";

/** Max agent-loop iterations per turn (bounded steps — see AGENTS.md). */
export const DEFAULT_ITERATION_LIMIT = 25;

export interface ReadOnlyMcpServerNames {
  /** Configured (Settings → Connectors) name of the observability remote MCP connector. */
  readonly observability: string;
  /** Configured name of the deployments remote MCP connector (read-only tools only — rollback is never registered on it, see mcp/deployments/server.ts). */
  readonly deployments: string;
  /** Configured name of the incidents (runbook) remote MCP connector. */
  readonly incidents: string;
}

export interface CommanderAgentSpecOptions {
  /** Model FQN, e.g. "anthropic/claude-sonnet-5". Read from TRUEFORGE_MODEL by callers. */
  readonly model: string;
  /** Full system prompt text — read agents/commander/system-prompt.v1.md and pass its contents here. */
  readonly instructions: string;
  readonly readOnlyMcpServerNames: ReadOnlyMcpServerNames;
  /** Max agent-loop iterations per turn. Default: DEFAULT_ITERATION_LIMIT. */
  readonly iterationLimit?: number;
}

function buildReadOnlyMcpServer(name: string): TrueForgeApi.McpServer {
  return {
    name,
    enableTools: ["@read-only"],
    // Nothing mutating is ever enabled on these connectors, so there is
    // nothing that could require approval — listed explicitly (rather than
    // left at the SDK default of `["@write", "@destructive"]`) so the
    // absence of any reachable mutating tool is visible in the spec itself.
    requireApprovalForTools: [],
  };
}

/**
 * Builds the commander agent spec. The returned spec's `mcpServers` list
 * contains exactly the three read-only connectors named in
 * `options.readOnlyMcpServerNames` — this is the structural guarantee that
 * the model can never reach a mutating tool, independent of prompt wording.
 */
export function buildCommanderAgentSpec(
  options: CommanderAgentSpecOptions,
): TrueForgeApi.AgentSpec {
  const { observability, deployments, incidents } =
    options.readOnlyMcpServerNames;

  return {
    model: { name: options.model },
    instructions: options.instructions,
    mcpServers: [
      buildReadOnlyMcpServer(observability),
      buildReadOnlyMcpServer(deployments),
      buildReadOnlyMcpServer(incidents),
    ],
    skills: [{ name: COMMANDER_SKILL_NAME }],
    config: {
      // Required for skills to load at all (TrueForge sandbox-as-a-tool,
      // Daytona-backed — architecturally distinct from this repo's own
      // bespoke sandbox/ used for generated-diagnostic execution; enabling
      // this does not relax any SECURITY.md invariant governing the
      // latter). See harness/README.md.
      sandbox: { enabled: true },
      // Bounded delegation: the SDK has no numeric "max subagents" field,
      // so bounding is enforced via the system prompt's explicit
      // delegation-budget wording plus the hard `iterationLimit` below.
      dynamicSubAgents: { enabled: true },
      askUserQuestions: { enabled: true },
      contextManagement: { compaction: { enabled: true } },
      iterationLimit: options.iterationLimit ?? DEFAULT_ITERATION_LIMIT,
    },
    responseFormat: {
      type: "json_schema",
      jsonSchema: investigationResultJsonSchema,
    },
  };
}
