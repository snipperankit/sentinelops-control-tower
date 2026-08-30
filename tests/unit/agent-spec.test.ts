import { describe, expect, it } from "vitest";
import {
  buildCommanderAgentSpec,
  COMMANDER_SKILL_NAME,
  DEFAULT_ITERATION_LIMIT,
} from "../../harness/agent/spec.js";

const READ_ONLY_NAMES = {
  observability: "sentinelops-observability",
  deployments: "sentinelops-deployments",
  incidents: "sentinelops-incidents",
};

describe("buildCommanderAgentSpec", () => {
  it("attaches exactly the three read-only MCP connectors, each restricted to @read-only tools", () => {
    const spec = buildCommanderAgentSpec({
      model: "anthropic/claude-sonnet-5",
      instructions: "system prompt text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
    });

    expect(spec.mcpServers).toHaveLength(3);
    const names = spec.mcpServers?.map((server) => server.name);
    expect(names).toEqual([
      READ_ONLY_NAMES.observability,
      READ_ONLY_NAMES.deployments,
      READ_ONLY_NAMES.incidents,
    ]);

    for (const server of spec.mcpServers ?? []) {
      expect(server.enableTools).toEqual(["@read-only"]);
      expect(server.requireApprovalForTools).toEqual([]);
    }
  });

  it("never references a rollback-capable connector by name or tool selector", () => {
    const spec = buildCommanderAgentSpec({
      model: "anthropic/claude-sonnet-5",
      instructions: "system prompt text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
    });

    const serialized = JSON.stringify(spec).toLowerCase();
    expect(serialized).not.toContain("rollback");
    expect(serialized).not.toContain("@write");
    expect(serialized).not.toContain("@destructive");
    expect(serialized).not.toContain("@all");
  });

  it("enables the incident-investigation skill and requires the sandbox for it", () => {
    const spec = buildCommanderAgentSpec({
      model: "anthropic/claude-sonnet-5",
      instructions: "system prompt text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
    });

    expect(spec.skills).toEqual([{ name: COMMANDER_SKILL_NAME }]);
    expect(spec.config?.sandbox?.enabled).toBe(true);
  });

  it("applies a bounded default iteration limit, overridable by the caller", () => {
    const defaultSpec = buildCommanderAgentSpec({
      model: "anthropic/claude-sonnet-5",
      instructions: "system prompt text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
    });
    expect(defaultSpec.config?.iterationLimit).toBe(DEFAULT_ITERATION_LIMIT);

    const customSpec = buildCommanderAgentSpec({
      model: "anthropic/claude-sonnet-5",
      instructions: "system prompt text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
      iterationLimit: 5,
    });
    expect(customSpec.config?.iterationLimit).toBe(5);
  });

  it("uses the caller-supplied model and instructions verbatim", () => {
    const spec = buildCommanderAgentSpec({
      model: "openai/gpt-5.2",
      instructions: "distinctive instructions text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
    });

    expect(spec.model).toEqual({ name: "openai/gpt-5.2" });
    expect(spec.instructions).toBe("distinctive instructions text");
  });

  it("sets the structured investigation-result response format", () => {
    const spec = buildCommanderAgentSpec({
      model: "anthropic/claude-sonnet-5",
      instructions: "system prompt text",
      readOnlyMcpServerNames: READ_ONLY_NAMES,
    });

    expect(spec.responseFormat).toMatchObject({
      type: "json_schema",
      jsonSchema: { name: "sentinelops_investigation_result" },
    });
  });
});
