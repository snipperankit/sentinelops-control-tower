import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  // Allow overriding the base URL via PLAYWRIGHT_BASE_URL env var (defaults
  // to the local dev server used during demo). Enable video recording so
  // test runs can be archived for demos.
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
  },
  // Do not force a preview webServer by default; Playwright will reuse an
  // existing dev server when available. The webServer remains available for
  // CI or when running against the built preview (port can be overridden).
  webServer: {
    command: "npm run preview",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
  // Store results (videos/traces) in the workspace top-level `test-videos`
  // directory so it's easy to find after a run.
  outputDir: "../../test-videos",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
