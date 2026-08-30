import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  prepareWorkspace,
  SANDBOX_ENTRY_FILE_NAME,
} from "../../sandbox/workspace.js";

describe("prepareWorkspace: lifecycle", () => {
  it("creates a fresh temporary workspace containing only the generated code", async () => {
    const workspace = await prepareWorkspace({
      code: "console.log('hi')",
      inputFixtures: [],
    });

    expect(existsSync(workspace.hostPath)).toBe(true);
    expect(existsSync(`${workspace.hostPath}/${SANDBOX_ENTRY_FILE_NAME}`)).toBe(
      true,
    );

    await workspace.destroy();
  });

  it("destroys the workspace directory on destroy()", async () => {
    const workspace = await prepareWorkspace({
      code: "console.log('hi')",
      inputFixtures: [],
    });

    await workspace.destroy();

    expect(existsSync(workspace.hostPath)).toBe(false);
  });

  it("copies only explicitly approved fixtures into the workspace", async () => {
    const workspace = await prepareWorkspace({
      code: "console.log('hi')",
      inputFixtures: ["sample-metrics.json"],
    });

    expect(
      existsSync(`${workspace.hostPath}/fixtures/sample-metrics.json`),
    ).toBe(true);

    await workspace.destroy();
  });

  it("rejects a non-approved fixture and cleans up the partially created workspace", async () => {
    await expect(
      prepareWorkspace({
        code: "console.log('hi')",
        inputFixtures: ["../fixtures.ts"],
      }),
    ).rejects.toThrow();
  });

  it("fails rather than silently succeeding when a fixture is missing on disk", async () => {
    await expect(
      prepareWorkspace({
        code: "console.log('hi')",
        inputFixtures: ["does-not-exist.json"],
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
