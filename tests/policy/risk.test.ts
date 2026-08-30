import { describe, it, expect } from "vitest";
import {
  classifyToolRisk,
  isToolAllowed,
  requiresApproval,
} from "../../policy/risk.js";
import { UnknownToolError } from "../../policy/errors.js";

describe("policy tool risk registry", () => {
  it("classifies slack.postMessage and mail.send as mutating (require approval)", () => {
    expect(classifyToolRisk("slack.postMessage").risk).toBe("mutating");
    expect(classifyToolRisk("mail.send").risk).toBe("mutating");
    expect(requiresApproval(classifyToolRisk("slack.postMessage").risk)).toBe(
      true,
    );
    expect(requiresApproval(classifyToolRisk("mail.send").risk)).toBe(true);
  });

  it("classifies the new context.* tools as read-only (no approval required)", () => {
    for (const toolName of [
      "context.get_github_pull_request",
      "context.get_bitbucket_pull_request",
      "context.search_web",
    ]) {
      const entry = classifyToolRisk(toolName);
      expect(entry.risk).toBe("read-only");
      expect(requiresApproval(entry.risk)).toBe(false);
      expect(isToolAllowed(toolName)).toBe(true);
    }
  });

  it("still denies a tool name that was never registered", () => {
    expect(() => classifyToolRisk("mcp.definitely_not_a_real_tool")).toThrow(
      UnknownToolError,
    );
    expect(isToolAllowed("mcp.definitely_not_a_real_tool")).toBe(false);
  });
});
