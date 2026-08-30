import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IncidentHeader } from "./IncidentHeader.js";
import type { EvidenceView } from "../types.js";

const INCIDENT = {
  id: "incident-1",
  title: "Payment failures elevated on checkout service",
  severity: "high" as const,
  openedAt: "2026-08-24T09:00:00.000Z",
};

const CONFIDENCE = { confidencePercent: 72, uncertaintyFactors: [] };

const EVIDENCE: readonly EvidenceView[] = [
  {
    id: "ev-1",
    sourceTool: "observability.query",
    query: "error_rate{service=checkout}",
    trust: "trusted",
    interpretation: "Error rate elevated since deploy 4c21.",
    resultHash: "abc123",
    observedAt: "2026-08-24T09:01:00.000Z",
  },
  {
    id: "ev-2",
    sourceTool: "deploy.history",
    query: "checkout deploys",
    trust: "untrusted",
    interpretation: "Deploy log excerpt.",
    resultHash: "def456",
    observedAt: "2026-08-24T09:02:00.000Z",
  },
];

const NOW = new Date("2026-08-24T09:01:03.500Z");

describe("IncidentHeader", () => {
  it("shows the incident title and severity", () => {
    render(
      <IncidentHeader
        incident={INCIDENT}
        state="investigating"
        confidence={CONFIDENCE}
        evidence={EVIDENCE}
        approval={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("incident-title")).toHaveTextContent(INCIDENT.title);
    expect(screen.getByTestId("incident-severity")).toHaveTextContent(/high/i);
  });

  it("always exposes the raw explicit session state", () => {
    render(
      <IncidentHeader
        incident={INCIDENT}
        state="awaiting_approval"
        confidence={CONFIDENCE}
        evidence={EVIDENCE}
        approval={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("incident-state")).toHaveTextContent("awaiting_approval");
  });

  it("derives confidence, signals, and elapsed stats only from real data — never fabricated numbers", () => {
    render(
      <IncidentHeader
        incident={INCIDENT}
        state="analyzing"
        confidence={CONFIDENCE}
        evidence={EVIDENCE}
        approval={null}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("incident-stat-confidence")).toHaveTextContent("72%");
    expect(screen.getByTestId("incident-stat-signals")).toHaveTextContent("1/2");
    expect(screen.getByTestId("incident-stat-elapsed")).toHaveTextContent("01:03.5");
  });
});
