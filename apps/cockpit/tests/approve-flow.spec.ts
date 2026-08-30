import { test, expect } from "@playwright/test";

test.describe("Cockpit approve flow", () => {
  test("finds pending approval and approves it, then opens TrueForge settings", async ({
    page,
    context,
  }) => {
    // Open the cockpit
    await page.goto("http://localhost:5174/", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the approval checkpoint to appear (up to 2 minutes)
    const approvalHeading = await page.waitForSelector(
      "text=Approval checkpoint",
      { timeout: 120_000 },
    );
    expect(approvalHeading).toBeTruthy();

    // Click Approve
    await page.click('button:has-text("Approve")');

    // If a confirmation appears, accept it
    try {
      const confirm = await page.waitForSelector(
        'button:has-text("Confirm"), button:has-text("Yes")',
        { timeout: 3000 },
      );
      if (confirm) await confirm.click();
    } catch (e) {
      // no confirmation dialog
    }

    // Give the session a moment to transition
    await page.waitForTimeout(1500);

    // Open TrueForge settings in a new tab to inspect provider settings
    const tf = await context.newPage();
    await tf.goto("http://localhost:8790/settings", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await tf.waitForLoadState("networkidle");

    const bodyText = await tf.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
