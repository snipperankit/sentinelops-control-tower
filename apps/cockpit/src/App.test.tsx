import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";

describe("App: full incident flow", () => {
  it("walks investigation -> approval -> rejection -> resume -> approval -> execution -> verification", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("incident-state")).toHaveTextContent("investigating");

    await screen.findByText("analyzing", { selector: "strong" }, { timeout: 3000 });
    await screen.findByText("awaiting_approval", { selector: "strong" }, { timeout: 3000 });
    expect(screen.getByTestId("approval-status")).toHaveTextContent("pending");

    await user.click(screen.getByTestId("reject-button"));
    expect(screen.getByTestId("incident-state")).toHaveTextContent("rejected");

    await user.click(screen.getByTestId("resume-button"));
    await screen.findByText("awaiting_approval", { selector: "strong" }, { timeout: 3000 });

    const secondApprovalStatus = screen.getByTestId("approval-status");
    expect(secondApprovalStatus).toHaveTextContent("pending");

    await user.click(screen.getByTestId("approve-button"));
    expect(screen.getByTestId("incident-state")).toHaveTextContent("approved");

    await screen.findByText("executing", { selector: "strong" }, { timeout: 3000 });
    await screen.findByText("verifying", { selector: "strong" }, { timeout: 3000 });
    await screen.findByText("verified", { selector: "strong" }, { timeout: 3000 });

    expect(screen.getByTestId("verification-status")).toHaveTextContent("passed");
  }, 15000);

  it("emergency-stops immediately regardless of the current phase", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("analyzing", { selector: "strong" }, { timeout: 3000 });
    await user.click(screen.getByTestId("emergency-stop-button"));

    expect(screen.getByTestId("incident-state")).toHaveTextContent("stopped");
  });
});

