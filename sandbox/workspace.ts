// Creates and destroys the isolated temporary workspace bind-mounted into
// the sandbox container. This is the ONLY host directory ever mounted —
// it is freshly created per execution, contains only the generated code
// and explicitly approved fixtures copied in by name, and is destroyed
// after every run (see .github/instructions/sandbox.instructions.md).
import { mkdir, mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { WorkspacePreparationError } from "./errors.js";
import { resolveApprovedFixturePath } from "./fixtures.js";

export const SANDBOX_ENTRY_FILE_NAME = "diagnostic.js";

export interface PreparedWorkspace {
  /** Absolute host path of the freshly created temporary workspace directory. */
  readonly hostPath: string;
  /** Removes the workspace directory recursively. Safe to call once; the runner always calls this in a `finally`. */
  destroy(): Promise<void>;
}

export async function prepareWorkspace(options: {
  readonly code: string;
  readonly inputFixtures: readonly string[];
}): Promise<PreparedWorkspace> {
  let hostPath: string;
  try {
    hostPath = await mkdtemp(join(tmpdir(), "sentinelops-sandbox-"));
  } catch (error) {
    throw new WorkspacePreparationError(
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await writeFile(
      join(hostPath, SANDBOX_ENTRY_FILE_NAME),
      options.code,
      "utf8",
    );

    if (options.inputFixtures.length > 0) {
      const fixturesDir = join(hostPath, "fixtures");
      await mkdir(fixturesDir);
      for (const name of options.inputFixtures) {
        const sourcePath = resolveApprovedFixturePath(name);
        await copyFile(sourcePath, join(fixturesDir, basename(name)));
      }
    }
  } catch (error) {
    await rm(hostPath, { recursive: true, force: true });
    throw error;
  }

  return {
    hostPath,
    async destroy() {
      await rm(hostPath, { recursive: true, force: true });
    },
  };
}
