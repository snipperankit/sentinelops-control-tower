import { describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import { EvidenceGraph } from "../../harness/audit/graph.js";
import {
  UnknownEvidenceReferenceError,
  UnknownHypothesisReferenceError,
} from "../../harness/audit/errors.js";

const CLOCK = new FixedClock(new Date("2026-08-24T00:00:00.000Z"));

function buildGraphWithEvidence() {
  const graph = new EvidenceGraph(CLOCK);
  const evidence = graph.recordEvidence({
    sessionId: "session-1",
    sourceTool: "observability.get_error_rates",
    query: "service=checkout,window=15m",
    trust: "trusted",
    interpretation: "error_rate spiked at incident onset",
    result: { errorRate: 0.12 },
  });
  return { graph, evidence };
}

describe("EvidenceGraph: evidence-to-hypothesis and hypothesis-to-action linkage", () => {
  it("links a hypothesis to the evidence that supports it", () => {
    const { graph, evidence } = buildGraphWithEvidence();

    const hypothesis = graph.recordHypothesis({
      sessionId: "session-1",
      statement: "deployment d-4521 caused the checkout error-rate spike",
      supportingEvidenceIds: [evidence.id],
      ruledOut: false,
    });

    expect(hypothesis.supportingEvidenceIds).toEqual([evidence.id]);
  });

  it("rejects a hypothesis that cites an unknown evidence ID", () => {
    const { graph } = buildGraphWithEvidence();

    expect(() =>
      graph.recordHypothesis({
        sessionId: "session-1",
        statement: "unsupported hypothesis",
        supportingEvidenceIds: ["does-not-exist"],
        ruledOut: false,
      }),
    ).toThrow(UnknownEvidenceReferenceError);
  });

  it("links a proposed action to the hypotheses that justify it", () => {
    const { graph, evidence } = buildGraphWithEvidence();
    const hypothesis = graph.recordHypothesis({
      sessionId: "session-1",
      statement: "deployment d-4521 caused the checkout error-rate spike",
      supportingEvidenceIds: [evidence.id],
      ruledOut: false,
    });

    const action = graph.recordProposedAction({
      sessionId: "session-1",
      toolName: "deployments.rollback",
      canonicalArgs: '{"targetDeploymentId":"d-4520"}',
      supportingHypothesisIds: [hypothesis.id],
    });

    expect(graph.getHypothesesForAction(action.id)).toEqual([hypothesis]);
  });

  it("rejects a proposed action that cites an unknown hypothesis ID", () => {
    const { graph } = buildGraphWithEvidence();

    expect(() =>
      graph.recordProposedAction({
        sessionId: "session-1",
        toolName: "deployments.rollback",
        canonicalArgs: "{}",
        supportingHypothesisIds: ["does-not-exist"],
      }),
    ).toThrow(UnknownHypothesisReferenceError);
  });

  it("resolves evidence linked to an action through its supporting hypotheses", () => {
    const { graph, evidence } = buildGraphWithEvidence();
    const hypothesis = graph.recordHypothesis({
      sessionId: "session-1",
      statement: "deployment d-4521 caused the checkout error-rate spike",
      supportingEvidenceIds: [evidence.id],
      ruledOut: false,
    });
    const action = graph.recordProposedAction({
      sessionId: "session-1",
      toolName: "deployments.rollback",
      canonicalArgs: '{"targetDeploymentId":"d-4520"}',
      supportingHypothesisIds: [hypothesis.id],
    });

    const linkedHypotheses = graph.getHypothesesForAction(action.id);
    expect(linkedHypotheses[0]?.supportingEvidenceIds).toEqual([evidence.id]);
  });
});

describe("EvidenceGraph: approval requests linked to evidence IDs", () => {
  it("links an approval request to the evidence that justifies it", () => {
    const { graph, evidence } = buildGraphWithEvidence();

    const link = graph.linkApprovalRequest("approval-1", [evidence.id]);

    expect(link.evidenceIds).toEqual([evidence.id]);
    expect(graph.getEvidenceForApproval("approval-1")).toEqual([evidence]);
  });

  it("rejects linking an approval request to an unknown evidence ID", () => {
    const { graph } = buildGraphWithEvidence();

    expect(() =>
      graph.linkApprovalRequest("approval-1", ["does-not-exist"]),
    ).toThrow(UnknownEvidenceReferenceError);
  });

  it("returns an empty list for an approval request with no linked evidence", () => {
    const { graph } = buildGraphWithEvidence();
    expect(graph.getEvidenceForApproval("never-linked")).toEqual([]);
  });
});

describe("EvidenceGraph: alternative hypotheses are preserved", () => {
  it("keeps a ruled-out hypothesis in the graph rather than removing it", () => {
    const { graph, evidence } = buildGraphWithEvidence();

    const ruledOut = graph.recordHypothesis({
      sessionId: "session-1",
      statement: "a scheduled batch job caused the spike",
      supportingEvidenceIds: [evidence.id],
      ruledOut: true,
      reason: "batch job logs show no activity in the incident window",
    });
    const active = graph.recordHypothesis({
      sessionId: "session-1",
      statement: "deployment d-4521 caused the spike",
      supportingEvidenceIds: [evidence.id],
      ruledOut: false,
    });

    const all = graph.listHypotheses();
    expect(all).toHaveLength(2);
    expect(all.find((h) => h.id === ruledOut.id)?.ruledOut).toBe(true);
    expect(all.find((h) => h.id === active.id)?.ruledOut).toBe(false);
  });
});
