import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationPanel } from "./VerificationPanel.js";

describe("VerificationPanel", () => {
  it("shows verification has not started when no result exists yet", () => {
    render(<VerificationPanel verification={null} />);
    expect(screen.getByText(/has not started/i)).toBeInTheDocument();
  });

  it("renders status, every independent signal, and residual risk from a structured result", () => {
    render(
      <VerificationPanel
        verification={{
          status: "passed",
          signals: [
            { name: "payment_failure_rate", status: "passed", detail: "back to 2.0%" },
            { name: "checkout_latency_p95", status: "passed", detail: "back to 850ms" },
          ],
          residualRisk: "Low",
        }}
      />,
    );
    expect(screen.getByTestId("verification-status")).toHaveTextContent("passed");
    expect(screen.getByTestId("verification-signal-payment_failure_rate")).toHaveTextContent(
      "back to 2.0%",
    );
    expect(screen.getByTestId("residual-risk")).toHaveTextContent("Low");
  });

  it("renders a pending status distinctly from passed, so partial verification is never shown as success", () => {
    render(
      <VerificationPanel
        verification={{
          status: "pending",
          signals: [{ name: "payment_failure_rate", status: "pending", detail: "collecting" }],
          residualRisk: "Unknown until verification completes.",
        }}
      />,
    );
    expect(screen.getByTestId("verification-status")).toHaveTextContent("pending");
  });
});
