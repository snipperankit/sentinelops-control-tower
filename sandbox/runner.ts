// Public entry point for running generated diagnostic code in the sandbox.
// Orchestrates request validation, workspace preparation, container
// execution, artifact collection, and guaranteed workspace cleanup — see
// .github/instructions/sandbox.instructions.md.
import { readdir, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExecutionRequestInput,
  SandboxArtifactReference,
  SandboxExecutionResult,
} from "./contract.js";
import { parseExecutionRequest } from "./contract.js";
import { isSandboxAvailable, runContainer } from "./docker-runner.js";
import { SandboxUnavailableError } from "./errors.js";
import { prepareWorkspace } from "./workspace.js";

const ARTIFACTS_DIR_NAME = "artifacts";

async function collectArtifacts(
  hostWorkspacePath: string,
): Promise<readonly SandboxArtifactReference[]> {
  const artifactsDir = join(hostWorkspacePath, ARTIFACTS_DIR_NAME);
  let entries: string[];
  try {
    entries = await readdir(artifactsDir);
  } catch {
    return [];
  }

  const artifacts: SandboxArtifactReference[] = [];
  for (const name of entries) {
    const stats = await stat(join(artifactsDir, name));
    if (stats.isFile()) {
      artifacts.push({ name, sizeBytes: stats.size });
    }
  }
  return artifacts;
}

/**
 * Validates the request, checks the sandbox isolation backend is
 * available, executes the generated code in an isolated container, and
 * always destroys the temporary workspace before returning — even if
 * execution fails or Docker itself is unreachable.
 *
 * Fails closed: if Docker is not reachable, this returns a
 * `sandbox_unavailable` result rather than running the generated code
 * directly on the host.
 */
export async function runSandboxExecution(
  rawRequest: ExecutionRequestInput,
): Promise<SandboxExecutionResult> {
  const request = parseExecutionRequest(rawRequest);

  if (!(await isSandboxAvailable())) {
    const error = new SandboxUnavailableError("Docker daemon is not reachable");
    return {
      status: "sandbox_unavailable",
      exitCode: null,
      signal: null,
      durationMs: 0,
      stdout: "",
      stderr: error.message,
      stdoutTruncated: false,
      stderrTruncated: false,
      artifacts: [],
      resourceLimitViolations: [],
    };
  }

  const workspace = await prepareWorkspace({
    code: request.code,
    inputFixtures: request.inputFixtures,
  });

  try {
    await mkdir(join(workspace.hostPath, ARTIFACTS_DIR_NAME));

    const result = await runContainer({
      hostWorkspacePath: workspace.hostPath,
      limits: request.limits,
    });

    const artifacts = await collectArtifacts(workspace.hostPath);
    return { ...result, artifacts };
  } finally {
    await workspace.destroy();
  }
}
