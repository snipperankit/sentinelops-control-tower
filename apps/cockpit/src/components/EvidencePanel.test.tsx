import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidencePanel } from "./EvidencePanel.js";

describe("EvidencePanel", () => {
  it("visibly labels untrusted evidence sources", () => {
    render(
      <EvidencePanel
        evidence={[
          {
            id: "ev-1",
            sourceTool: "incidents.get_runbook",
            query: "service=checkout",
            trust: "untrusted",
            interpretation: "runbook text returned by the tool",
            resultHash: "abcdef1234567890",
            observedAt: "2026-08-24T09:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("evidence-trust-ev-1")).toHaveTextContent("untrusted");
  });

  it("labels trusted evidence distinctly from untrusted evidence", () => {
    render(
      <EvidencePanel
        evidence={[
          {
            id: "ev-2",
            sourceTool: "observability.get_error_rates",
            query: "service=checkout",
            trust: "trusted",
            interpretation: "error rate rose",
            resultHash: "abcdef1234567890",
            observedAt: "2026-08-24T09:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("evidence-trust-ev-2")).toHaveTextContent("trusted");
  });

  it("renders a placeholder when no evidence has been recorded yet", () => {
    render(<EvidencePanel evidence={[]} />);
    expect(screen.getByText(/no evidence recorded/i)).toBeInTheDocument();
  });
});
