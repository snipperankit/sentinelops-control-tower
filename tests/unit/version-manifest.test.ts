import { describe, expect, it } from "vitest";
import {
  buildVersionManifest,
  type VersionManifestInput,
} from "../../harness/audit/versions.js";
import { MissingVersionComponentError } from "../../harness/audit/errors.js";

function baseInput(
  overrides: Partial<VersionManifestInput> = {},
): VersionManifestInput {
  return {
    agentVersion: "commander-v1",
    modelVersion: "anthropic/claude-sonnet-5",
    policyVersion: "policy-gateway-v1",
    toolVersion: "mcp-contracts-v1",
    sandboxVersion: "sandbox-docker-v1",
    approvalVersion: "approval-v1",
    mutationVersion: "deployments.rollback-v1",
    verificationVersion: "verification-agent-v1",
    ...overrides,
  };
}

describe("buildVersionManifest", () => {
  it("returns a complete manifest when every component is present", () => {
    const manifest = buildVersionManifest(baseInput());
    expect(manifest).toEqual(baseInput());
  });

  it("rejects a manifest missing the policy version", () => {
    expect(() =>
      buildVersionManifest(baseInput({ policyVersion: "" })),
    ).toThrow(MissingVersionComponentError);
  });

  it("rejects a manifest missing the sandbox version", () => {
    expect(() =>
      buildVersionManifest(baseInput({ sandboxVersion: "" })),
    ).toThrow(MissingVersionComponentError);
  });

  it("rejects a manifest missing the mutation or verification version", () => {
    expect(() =>
      buildVersionManifest(baseInput({ mutationVersion: "" })),
    ).toThrow(MissingVersionComponentError);
    expect(() =>
      buildVersionManifest(baseInput({ verificationVersion: "" })),
    ).toThrow(MissingVersionComponentError);
  });
});
