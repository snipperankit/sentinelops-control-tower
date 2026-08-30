import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSandboxExecution } from "../../sandbox/index.js";

// These tests execute real, generated-style "attack" code inside real
// Docker containers via the full sandbox pipeline. Each one demonstrates
// that a specific attack is blocked or safely terminated — never that the
// isolation was weakened or bypassed to make the test pass (see
// .github/instructions/sandbox.instructions.md and AGENTS.md).
//
// Docker-based runs take real wall-clock time (container start/stop), so
// each test gets a generous vitest timeout well above the sandbox's own
// resourceLimits.timeoutMs.

describe("sandbox isolation: adversarial scenarios", () => {
  it("blocks environment-variable access: host secrets never reach the container", async () => {
    process.env["SENTINELOPS_HOST_ONLY_SECRET"] = "leak-me-if-you-can";
    try {
      const result = await runSandboxExecution({
        code: `
            const secret = process.env.SENTINELOPS_HOST_ONLY_SECRET;
            console.log(JSON.stringify({
              secretLeaked: secret !== undefined,
              envKeys: Object.keys(process.env).sort(),
            }));
          `,
      });

      expect(result.status).toBe("completed");
      const output = JSON.parse(result.stdout) as {
        secretLeaked: boolean;
        envKeys: string[];
      };
      expect(output.secretLeaked).toBe(false);
      expect(output.envKeys).not.toContain("SENTINELOPS_HOST_ONLY_SECRET");
    } finally {
      delete process.env["SENTINELOPS_HOST_ONLY_SECRET"];
    }
  }, 20_000);

  it("blocks network access: outbound connections fail immediately", async () => {
    const result = await runSandboxExecution({
      code: `
          const http = require("node:http");
          const req = http.get("http://example.com", () => {
            console.log("CONNECTED");
          });
          req.on("error", (err) => {
            console.log("BLOCKED:" + err.code);
          });
          req.setTimeout(3000, () => {
            req.destroy();
            console.log("BLOCKED:TIMEOUT");
          });
        `,
      limits: { timeoutMs: 8_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.stdout).toContain("BLOCKED:");
    expect(result.stdout).not.toContain("CONNECTED");
  }, 20_000);

  it("blocks path traversal: writes outside the workspace are rejected by the read-only root filesystem", async () => {
    const result = await runSandboxExecution({
      code: `
          const fs = require("node:fs");
          try {
            fs.writeFileSync("../../../../etc/passwd", "pwned");
            console.log("WRITE_SUCCEEDED");
          } catch (err) {
            console.log("WRITE_BLOCKED:" + err.code);
          }
        `,
    });

    expect(result.status).toBe("completed");
    expect(result.stdout).toContain("WRITE_BLOCKED:");
    expect(result.stdout).not.toContain("WRITE_SUCCEEDED");
  }, 20_000);

  it("blocks host-file access: a file that exists only on the host is unreachable from the container", async () => {
    const hostOnlyDir = await mkdtemp(join(tmpdir(), "sentinelops-host-only-"));
    const hostOnlyFile = join(hostOnlyDir, "host-secret.txt");
    await writeFile(hostOnlyFile, "host-only-content", "utf8");

    try {
      const result = await runSandboxExecution({
        code: `
            const fs = require("node:fs");
            const candidates = ${JSON.stringify([hostOnlyFile])};
            const found = candidates.some((p) => {
              try {
                fs.readFileSync(p);
                return true;
              } catch {
                return false;
              }
            });
            console.log(found ? "HOST_FILE_LEAKED" : "HOST_FILE_UNREACHABLE");
          `,
      });

      expect(result.status).toBe("completed");
      expect(result.stdout.trim()).toBe("HOST_FILE_UNREACHABLE");
    } finally {
      await rm(hostOnlyDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("safely terminates infinite execution via the wall-clock timeout", async () => {
    const result = await runSandboxExecution({
      code: `while (true) {}`,
      limits: { timeoutMs: 1_500 },
    });

    expect(result.status).toBe("timed_out");
    expect(result.resourceLimitViolations).toContain("execution_time");
    // Bounded: killed close to the configured timeout, not left running.
    expect(result.durationMs).toBeLessThan(10_000);
  }, 20_000);

  it("safely terminates excessive output and reports truncation", async () => {
    const result = await runSandboxExecution({
      code: `
          while (true) {
            process.stdout.write("x".repeat(1000) + "\\n");
          }
        `,
      limits: { maxOutputBytes: 8_192, timeoutMs: 10_000 },
    });

    expect(result.status).toBe("resource_limit_exceeded");
    expect(result.resourceLimitViolations).toContain("output_size");
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(8_192);
  }, 20_000);

  it("blocks Docker socket access: the socket is never mounted into the container", async () => {
    const result = await runSandboxExecution({
      code: `
          const fs = require("node:fs");
          try {
            fs.accessSync("/var/run/docker.sock");
            console.log("SOCKET_FOUND");
          } catch (err) {
            console.log("SOCKET_BLOCKED:" + err.code);
          }
        `,
    });

    expect(result.status).toBe("completed");
    expect(result.stdout).toContain("SOCKET_BLOCKED:");
    expect(result.stdout).not.toContain("SOCKET_FOUND");
  }, 20_000);

  it("blocks direct mutation of demo-world state: the demo fixtures are not reachable from the sandbox", async () => {
    const result = await runSandboxExecution({
      code: `
          const fs = require("node:fs");
          const candidates = [
            "/workspace/../harness/demo/fixtures/world.json",
            "/harness/demo/fixtures/world.json",
            "/repo/harness/demo/fixtures/world.json",
          ];
          const reachable = candidates.some((p) => {
            try {
              fs.accessSync(p);
              return true;
            } catch {
              return false;
            }
          });
          console.log(reachable ? "DEMO_STATE_REACHABLE" : "DEMO_STATE_UNREACHABLE");
        `,
    });

    expect(result.status).toBe("completed");
    expect(result.stdout.trim()).toBe("DEMO_STATE_UNREACHABLE");
  }, 20_000);

  it("runs generated code inside the fixed /workspace directory", async () => {
    const result = await runSandboxExecution({
      code: `console.log(process.cwd())`,
    });

    expect(result.status).toBe("completed");
    expect(result.stdout.trim()).toBe("/workspace");
  }, 20_000);

  it("does not leave orphaned temporary workspace directories on disk", async () => {
    const before = existsSync(tmpdir());
    expect(before).toBe(true); // sanity: tmpdir itself exists

    await runSandboxExecution({ code: `console.log("ok")` });

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(tmpdir());
    const leftoverSandboxDirs = entries.filter((name) =>
      name.startsWith("sentinelops-sandbox-"),
    );
    expect(leftoverSandboxDirs).toHaveLength(0);
  }, 20_000);
});
