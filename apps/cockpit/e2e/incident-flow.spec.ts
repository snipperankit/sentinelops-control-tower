import { expect, test } from "@playwright/test";

test.describe("Incident cockpit: full investigation-to-verification flow", () => {
  test("investigation -> approval -> rejection -> resume -> approval -> execution -> verification", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("incident-state")).toContainText(
      "investigating",
    );

    await expect(page.getByTestId("incident-state")).toContainText(
      "analyzing",
      { timeout: 5000 },
    );

    await expect(page.getByTestId("incident-state")).toContainText(
      "awaiting_approval",
      {
        timeout: 5000,
      },
    );
    await expect(page.getByTestId("approval-card")).toHaveAttribute(
      "role",
      "alert",
    );
    await expect(page.getByTestId("approval-status")).toContainText("pending");

    // The approval checkpoint must not be skippable by autonomous advancement.
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("incident-state")).toContainText(
      "awaiting_approval",
    );

    await page.getByTestId("reject-button").click();
    await expect(page.getByTestId("incident-state")).toContainText("rejected");

    await page.getByTestId("resume-button").click();
    await expect(page.getByTestId("incident-state")).toContainText("analyzing");

    await expect(page.getByTestId("incident-state")).toContainText(
      "awaiting_approval",
      {
        timeout: 5000,
      },
    );

    const approveButton = page.getByTestId("approve-button");
    await expect(approveButton).toBeEnabled();
    await approveButton.click();

    await expect(page.getByTestId("incident-state")).toContainText("approved");
    await expect(page.getByTestId("incident-state")).toContainText(
      "executing",
      { timeout: 5000 },
    );
    await expect(page.getByTestId("incident-state")).toContainText(
      "verifying",
      { timeout: 5000 },
    );
    await expect(page.getByTestId("incident-state")).toContainText("verified", {
      timeout: 5000,
    });

    await expect(page.getByTestId("verification-status")).toContainText(
      "passed",
    );
    await expect(page.getByTestId("residual-risk")).toBeVisible();
  });

  test("emergency stop halts the session immediately from any phase", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("incident-state")).toContainText(
      "analyzing",
      { timeout: 5000 },
    );

    await page.getByTestId("emergency-stop-button").click();
    await expect(page.getByTestId("incident-state")).toContainText("stopped");
  });
});
