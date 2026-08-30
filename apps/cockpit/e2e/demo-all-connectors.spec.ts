import { test, expect } from "@playwright/test";

test.describe("Demo: exercise all adapters and UI", () => {
  test.beforeEach(() => {
    test.setTimeout(180_000);
  });

  test("exercise adapters, tabs, state machine, and record UI", async ({
    page,
    context,
  }) => {
    // Navigate to app root (uses baseURL from playwright config)
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Wait for the topbar/session id to appear indicating app is ready
    // Prefer the harness-live indicator test id for reliability.
    await page
      .waitForSelector('[data-testid="harness-live-indicator"]', {
        timeout: 60_000,
      })
      .catch(() => null);

    // Open the Harness tab to access the Adapters panel. Try role first,
    // then fall back to a text selector for resilience across UI variants.
    // Try testid first (most reliable), then role, then text fallback.
    try {
      await page.getByTestId("tab-harness").click({ timeout: 10_000 });
    } catch {
      try {
        await page
          .getByRole("tab", { name: /Harness/i })
          .click({ timeout: 10_000 });
      } catch {
        await page.click("text=Harness", { timeout: 10_000 });
      }
    }
    await page.waitForSelector('[data-testid="integration-status-grid"]', {
      timeout: 30_000,
    });

    // Run the demo 'Run all' that exercises read-only adapters
    await page.getByRole("button", { name: /Run all \(demo\)/i }).click();

    // Wait for run-all results to appear
    const runAll = page.locator('[data-testid="run-all-results"]');
    await runAll.waitFor({ timeout: 60_000 });

    // Expand and scroll the results so the video captures the JSON
    await runAll.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(500);

    // Trigger individual adapter buttons to show their UI flows
    const actions = [
      "Fetch PR (demo)",
      "Fetch Bitbucket PR (demo)",
      "Web Search",
      "Query Grafana",
      "Run SQL",
      "Post Slack",
      "Send Mail",
    ];

    for (const name of actions) {
      try {
        const btn = page.getByRole("button", { name: new RegExp(name, "i") });
        await btn.click({ timeout: 10_000 });
        // Wait briefly for the result pre to update
        await page.waitForTimeout(1000);
      } catch (e) {
        // Continue even if a particular adapter/button is absent
      }
    }

    // Visit Decision, Evidence, and Audit trail tabs and scroll them
    const tabs = ["Decision", /Evidence/i, /Audit trail/i];
    for (const t of tabs) {
      try {
        await page.getByRole("tab", { name: t }).click();
        await page.waitForTimeout(500);
        await page.keyboard.press("PageDown");
        await page.waitForTimeout(500);
      } catch {
        // ignore missing tabs
      }
    }

    // Open the Sandbox JSON link (if present) to show raw session JSON
    try {
      const jsonLink = page.getByRole("link", { name: /View session JSON/i });
      const [jsonPage] = await Promise.all([
        context.waitForEvent("page"),
        jsonLink.click(),
      ]);
      await jsonPage.waitForLoadState("networkidle");
      await jsonPage.keyboard.press("PageDown");
      await page.waitForTimeout(500);
      await jsonPage.close();
    } catch {
      // ignore if not present
    }

    // Open TrueForge settings in a new page so judges can inspect the registered connectors
    try {
      const tf = await context.newPage();
      await tf.goto("http://localhost:8790/settings", {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await tf.waitForLoadState("networkidle");
      await tf.keyboard.press("PageDown");
      await page.waitForTimeout(500);
      await tf.close();
    } catch {
      // ignore if TrueForge not reachable
    }

    // Final sanity: ensure run-all-results contains at least one adapter key
    const txt = await runAll.innerText().catch(() => "");
    expect(txt.length).toBeGreaterThan(0);
  });
});
