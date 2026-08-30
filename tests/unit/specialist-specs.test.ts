import { describe, expect, it } from "vitest";
import {
  buildObservabilityInvestigatorAgentSpec,
  buildDeploymentInvestigatorAgentSpec,
  buildRunbookInvestigatorAgentSpec,
  buildSecurityReviewerAgentSpec,
  buildVerificationAgentSpec,
  OBSERVABILITY_INVESTIGATOR_TOOLS,
  DEPLOYMENT_INVESTIGATOR_TOOLS,
  DEPLOYMENT_INVESTIGATOR_CONTEXT_TOOLS,
  RUNBOOK_INVESTIGATOR_TOOLS,
  VERIFICATION_AGENT_OBSERVABILITY_TOOLS,
  VERIFICATION_AGENT_DEPLOYMENT_TOOLS,
} from "../../harness/agent/specialists.js";

const MODEL = "anthropic/claude-sonnet-5";
const INSTRUCTIONS = "system prompt text";

describe("specialist agent specs: distinct, explicit, bounded tool allowlists", () => {
  it("observability investigator: attaches exactly its four explicit tool names on one connector", () => {
    const spec = buildObservabilityInvestigatorAgentSpec({
      model: MODEL,
      instructions: INSTRUCTIONS,
      mcpServerName: "sentinelops-observability",
    });

    expect(spec.mcpServers).toHaveLength(1);
    expect(spec.mcpServers?.[0]?.enableTools).toEqual([
      ...OBSERVABILITY_INVESTIGATOR_TOOLS,
    ]);
    expect(spec.mcpServers?.[0]?.requireApprovalForTools).toEqual([]);
  });

  it("deployment investigator: attaches exactly its four explicit tool names, never rollback", () => {
    const spec = buildDeploymentInvestigatorAgentSpec({
      model: MODEL,
      instructions: INSTRUCTIONS,
      mcpServerName: "sentinelops-deployments",
    });

    expect(spec.mcpServers).toHaveLength(1);
    expect(spec.mcpServers?.[0]?.enableTools).toEqual([
      ...DEPLOYMENT_INVESTIGATOR_TOOLS,
    ]);
    // "get_rollback_prerequisites" legitimately contains "rollback" (it only
    // reports eligibility); the actual mutating tool name is never present.
    expect(spec.mcpServers?.[0]?.enableTools).not.toContain(
      "deployments.rollback",
    );
  });

  it("deployment investigator: with a context connector name, attaches a second connector restricted to GitHub/Bitbucket/web-search tools only", () => {
    const spec = buildDeploymentInvestigatorAgentSpec({
      model: MODEL,
      instructions: INSTRUCTIONS,
      mcpServerName: "sentinelops-deployments",
      contextMcpServerName: "sentinelops-context",
    });

    expect(spec.mcpServers).toHaveLength(2);
    expect(spec.mcpServers?.[1]?.enableTools).toEqual([
      ...DEPLOYMENT_INVESTIGATOR_CONTEXT_TOOLS,
    ]);
    expect(spec.mcpServers?.[1]?.requireApprovalForTools).toEqual([]);
  });

  it("runbook investigator: attaches exactly its single explicit tool name", () => {
    const spec = buildRunbookInvestigatorAgentSpec({
      model: MODEL,
      instructions: INSTRUCTIONS,
      mcpServerName: "sentinelops-incidents",
    });

    expect(spec.mcpServers).toHaveLength(1);
    expect(spec.mcpServers?.[0]?.enableTools).toEqual([
      ...RUNBOOK_INVESTIGATOR_TOOLS,
    ]);
  });

  it("security reviewer: has no MCP server at all", () => {
    const spec = buildSecurityReviewerAgentSpec({
      model: MODEL,
      instructions: INSTRUCTIONS,
    });

    expect(spec.mcpServers).toEqual([]);
  });

  it("verification agent: attaches two connectors, each restricted to a narrower tool set than the investigators get", () => {
    const spec = buildVerificationAgentSpec({
      model: MODEL,
      instructions: INSTRUCTIONS,
      observabilityMcpServerName: "sentinelops-observability",
      deploymentsMcpServerName: "sentinelops-deployments",
    });

    expect(spec.mcpServers).toHaveLength(2);
    expect(spec.mcpServers?.[0]?.enableTools).toEqual([
      ...VERIFICATION_AGENT_OBSERVABILITY_TOOLS,
    ]);
    expect(spec.mcpServers?.[1]?.enableTools).toEqual([
      ...VERIFICATION_AGENT_DEPLOYMENT_TOOLS,
    ]);
    // Narrower than the deployment investigator's full read-only set.
    expect(spec.mcpServers?.[1]?.enableTools).toEqual([
      "deployments.get_health",
    ]);
  });

  it("never references a mutating tool selector or rollback tool in any specialist spec", () => {
    const specs = [
      buildObservabilityInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-observability",
      }),
      buildDeploymentInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-deployments",
      }),
      buildRunbookInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-incidents",
      }),
      buildSecurityReviewerAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
      }),
      buildVerificationAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        observabilityMcpServerName: "sentinelops-observability",
        deploymentsMcpServerName: "sentinelops-deployments",
      }),
    ];

    for (const spec of specs) {
      const serialized = JSON.stringify(spec).toLowerCase();
      // "deployments.get_rollback_prerequisites" is a legitimate read-only
      // tool (reports eligibility only); the mutating tool is never present.
      expect(serialized).not.toContain('deployments.rollback"');
      expect(serialized).not.toContain("@write");
      expect(serialized).not.toContain("@destructive");
      expect(serialized).not.toContain("@all");
    }
  });

  it("never enables dynamicSubAgents on any specialist spec (bounded delegation depth)", () => {
    const specs = [
      buildObservabilityInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-observability",
      }),
      buildDeploymentInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-deployments",
      }),
      buildRunbookInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-incidents",
      }),
      buildSecurityReviewerAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
      }),
      buildVerificationAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        observabilityMcpServerName: "sentinelops-observability",
        deploymentsMcpServerName: "sentinelops-deployments",
      }),
    ];

    for (const spec of specs) {
      expect(spec.config?.dynamicSubAgents).toBeUndefined();
    }
  });

  it("gives each specialist a distinct response-format schema name", () => {
    const names = [
      buildObservabilityInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-observability",
      }),
      buildDeploymentInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-deployments",
      }),
      buildRunbookInvestigatorAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        mcpServerName: "sentinelops-incidents",
      }),
      buildSecurityReviewerAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
      }),
      buildVerificationAgentSpec({
        model: MODEL,
        instructions: INSTRUCTIONS,
        observabilityMcpServerName: "sentinelops-observability",
        deploymentsMcpServerName: "sentinelops-deployments",
      }),
    ].map(
      (spec) =>
        (spec.responseFormat as { jsonSchema: { name: string } }).jsonSchema
          .name,
    );

    expect(new Set(names).size).toBe(names.length);
  });
});
