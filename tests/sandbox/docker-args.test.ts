import { describe, expect, it } from "vitest";
import {
  buildDockerRunArgs,
  SANDBOX_IMAGE,
} from "../../sandbox/docker-runner.js";
import { resourceLimitsSchema } from "../../sandbox/contract.js";

const limits = resourceLimitsSchema.parse({});

describe("buildDockerRunArgs: isolation flags", () => {
  const args = buildDockerRunArgs(
    "sentinelops-sandbox-test",
    "/tmp/fake-workspace",
    limits,
  );

  it("never mounts the Docker socket", () => {
    expect(args.join(" ")).not.toContain("docker.sock");
  });

  it("disables networking", () => {
    expect(args).toContain("--network");
    expect(args[args.indexOf("--network") + 1]).toBe("none");
  });

  it("runs as a fixed non-root user", () => {
    expect(args).toContain("--user");
    const user = args[args.indexOf("--user") + 1];
    expect(user).not.toBe("0:0");
    expect(user).not.toBe("root");
  });

  it("drops all capabilities and disables privilege escalation", () => {
    expect(args).toContain("--cap-drop");
    expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(args).toContain("no-new-privileges");
  });

  it("mounts only the caller-supplied workspace, never the repo or $HOME", () => {
    const mountFlags = args.filter((arg) => arg === "-v");
    expect(mountFlags).toHaveLength(1);
    const mountArg = args[args.indexOf("-v") + 1];
    expect(mountArg).toBe("/tmp/fake-workspace:/workspace:rw");
  });

  it("makes the root filesystem read-only", () => {
    expect(args).toContain("--read-only");
  });

  it("never forwards arbitrary host environment variables, only fixed sandbox values", () => {
    const envFlags: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === "--env") {
        const value = args[i + 1];
        if (value !== undefined) {
          envFlags.push(value);
        }
      }
    }
    expect(envFlags).toEqual(["NODE_ENV=sandbox", "HOME=/tmp"]);
  });

  it("enforces CPU, memory, and process-count limits", () => {
    expect(args).toContain("--pids-limit");
    expect(args).toContain("--cpus");
    expect(args).toContain("--memory");
    expect(args).toContain("--memory-swap");
  });

  it("uses the pinned sandbox image", () => {
    expect(args).toContain(SANDBOX_IMAGE);
  });
});
