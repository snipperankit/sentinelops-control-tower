import { describe, expect, it } from "vitest";
import { aggregateSpecialistFindings } from "../../harness/agent/aggregate.js";
import type { VerdictEntry } from "../../harness/agent/disagreement.js";

describe("aggregateSpecialistFindings: the commander must not hide conflicting results", () => {
  it("always includes a disagreements field, even when specialists agree (empty, not omitted)", () => {
    const findings: readonly VerdictEntry[] = [
      {
        specialist: "observability-investigator",
        verdict: "supports_mutation",
        reason: "a",
      },
      {
        specialist: "deployment-investigator",
        verdict: "supports_mutation",
        reason: "b",
      },
    ];

    const report = aggregateSpecialistFindings(findings);

    expect(report).toHaveProperty("disagreements");
    expect(report.disagreements).toEqual([]);
    expect(report.hasDisagreement).toBe(false);
    expect(report.specialistFindings).toEqual(findings);
  });

  it("surfaces every specialist's conflicting verdict rather than resolving it silently", () => {
    const findings: readonly VerdictEntry[] = [
      {
        specialist: "deployment-investigator",
        verdict: "supports_mutation",
        reason: "deploy diff matches symptom",
      },
      {
        specialist: "security-reviewer",
        verdict: "against_mutation",
        reason: "runbook evidence contains a prompt-injection attempt",
      },
    ];

    const report = aggregateSpecialistFindings(findings);

    expect(report.hasDisagreement).toBe(true);
    expect(report.disagreements).toHaveLength(1);
    expect(report.disagreements[0]?.specialists).toEqual([
      "deployment-investigator",
      "security-reviewer",
    ]);
    // Both specialists' full findings remain present, not just the "winner".
    expect(report.specialistFindings).toEqual(findings);
  });
});
