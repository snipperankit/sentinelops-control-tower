// Low-level Docker Engine invocation for the sandbox. This is the only
// module that shells out to `docker`; every isolation control required by
// SECURITY.md and .github/instructions/sandbox.instructions.md is encoded
// in `buildDockerRunArgs` so it can be reviewed and unit-tested as plain
// data, independent of actually running a container.
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  ResourceLimitViolation,
  ResourceLimits,
  SandboxExecutionResult,
  SandboxExecutionStatus,
} from "./contract.js";
import { SANDBOX_ENTRY_FILE_NAME } from "./workspace.js";

const execFileAsync = promisify(execFile);

export const SANDBOX_IMAGE = "node:20-alpine";
/** Fixed non-root uid:gid inside the container ("nobody" on node:20-alpine). Generated code never runs as root (see SECURITY.md). */
const SANDBOX_USER = "65534:65534";

/**
 * Checks whether the Docker daemon is reachable. Never throws — the runner
 * must fail closed, not fall back to unsandboxed execution, when this is
 * false. Timeout is 15s (not 5s): `docker info` alone has been observed to
 * take 5-6s on a loaded Docker Desktop/WSL2 host, which made a 5s timeout a
 * false-negative source (reported as sandbox_unavailable when Docker was in
 * fact reachable, just slow to answer this one health check).
 */
export async function isSandboxAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the `docker run` argument list. Exported so tests can assert on
 * the argument list itself (e.g. it never contains a Docker-socket mount
 * or a broad host filesystem mount) independent of actually running
 * Docker.
 */
export function buildDockerRunArgs(
  containerName: string,
  hostWorkspacePath: string,
  limits: ResourceLimits,
): readonly string[] {
  return [
    "run",
    "--name",
    containerName,
    "--network",
    "none",
    "--user",
    SANDBOX_USER,
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    String(limits.pidsLimit),
    "--cpus",
    String(limits.cpus),
    "--memory",
    `${limits.memoryMb}m`,
    "--memory-swap",
    `${limits.memoryMb}m`,
    "--env",
    "NODE_ENV=sandbox",
    "--env",
    "HOME=/tmp",
    // The ONLY host mount: the caller's freshly created, single-execution
    // temporary workspace (see workspace.ts). Never the repo, never $HOME,
    // never the Docker socket.
    "-v",
    `${hostWorkspacePath}:/workspace:rw`,
    "-w",
    "/workspace",
    SANDBOX_IMAGE,
    "node",
    `/workspace/${SANDBOX_ENTRY_FILE_NAME}`,
  ];
}

async function dockerKill(containerName: string): Promise<void> {
  try {
    await execFileAsync("docker", ["kill", containerName], {
      timeout: 5_000,
    });
  } catch {
    // Best effort: the container may already have exited on its own.
  }
}

async function dockerRemove(containerName: string): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", containerName], {
      timeout: 5_000,
    });
  } catch {
    // Best effort: already removed, or never successfully created.
  }
}

interface ContainerState {
  readonly ExitCode: number;
  readonly OOMKilled: boolean;
}

async function inspectState(
  containerName: string,
): Promise<ContainerState | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["inspect", "--format", "{{json .State}}", containerName],
      { timeout: 5_000 },
    );
    return JSON.parse(stdout) as ContainerState;
  } catch {
    return undefined;
  }
}

export interface RunContainerOptions {
  readonly hostWorkspacePath: string;
  readonly limits: ResourceLimits;
}

/**
 * Runs one generated-diagnostic execution to completion inside a fresh,
 * isolated container and returns a structured result. Always removes the
 * container before returning, whether it exited on its own or was killed
 * for exceeding a limit.
 */
export async function runContainer(
  options: RunContainerOptions,
): Promise<SandboxExecutionResult> {
  const containerName = `sentinelops-sandbox-${randomUUID()}`;
  const args = buildDockerRunArgs(
    containerName,
    options.hostWorkspacePath,
    options.limits,
  );

  const startedAt = Date.now();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const byteCounts = { stdout: 0, stderr: 0 };
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;
  const violations = new Set<ResourceLimitViolation>();

  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });

  const captureStream = (
    chunks: Buffer[],
    stream: "stdout" | "stderr",
    chunk: Buffer,
  ): void => {
    const remaining = options.limits.maxOutputBytes - byteCounts[stream];
    if (remaining <= 0) {
      return;
    }
    if (chunk.length > remaining) {
      chunks.push(chunk.subarray(0, remaining));
      byteCounts[stream] += remaining;
      if (stream === "stdout") {
        stdoutTruncated = true;
      } else {
        stderrTruncated = true;
      }
      violations.add("output_size");
      void dockerKill(containerName);
    } else {
      chunks.push(chunk);
      byteCounts[stream] += chunk.length;
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    captureStream(stdoutChunks, "stdout", chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    captureStream(stderrChunks, "stderr", chunk);
  });

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    violations.add("execution_time");
    void dockerKill(containerName);
  }, options.limits.timeoutMs);

  const { exitCode, signal } = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveClose) => {
    child.on("close", (code, sig) => {
      resolveClose({ exitCode: code, signal: sig });
    });
  });

  clearTimeout(timeoutHandle);

  const state = await inspectState(containerName);
  await dockerRemove(containerName);

  if (state?.OOMKilled) {
    violations.add("memory");
  }

  const finalExitCode = state?.ExitCode ?? exitCode;
  const durationMs = Date.now() - startedAt;

  let status: SandboxExecutionStatus;
  if (timedOut) {
    status = "timed_out";
  } else if (violations.has("output_size") || violations.has("memory")) {
    status = "resource_limit_exceeded";
  } else if (finalExitCode === 0) {
    status = "completed";
  } else {
    status = "failed";
  }

  return {
    status,
    exitCode: finalExitCode,
    signal,
    durationMs,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    stdoutTruncated,
    stderrTruncated,
    artifacts: [],
    resourceLimitViolations: [...violations],
  };
}
