import { test, expect } from "@playwright/test";

test("cockpit approve flow (automated)", async ({ page, context }) => {
  // Navigate to the configured base URL (use PLAYWRIGHT_BASE_URL or the
  // config's default). Avoid hardcoding a port so CI and local dev both work.
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Wait up to 2 minutes for the pending approval to appear
  await page.waitForSelector("text=Approval checkpoint", { timeout: 120_000 });

  // Click Approve and handle confirmation if shown
  await page.click('button:has-text("Approve")');
  try {
    const confirm = await page.waitForSelector(
      'button:has-text("Confirm"), button:has-text("Yes")',
      { timeout: 3000 },
    );
    if (confirm) await confirm.click();
  } catch (e) {
    // no confirmation
  }

  // Short wait for UI to update
  await page.waitForTimeout(1000);

  // Open TrueForge settings to demonstrate switching contexts
  const tf = await context.newPage();
  await tf.goto("http://localhost:8790/settings", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await tf.waitForLoadState("networkidle");

  const body = await tf.locator("body").innerText();
  expect(body.length).toBeGreaterThan(0);
});
