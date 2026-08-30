import { describe, expect, it } from "vitest";
import {
  detectDisagreement,
  type VerdictEntry,
} from "../../harness/agent/disagreement.js";

describe("detectDisagreement", () => {
  it("returns no disagreements when every specialist agrees", () => {
    const entries: readonly VerdictEntry[] = [
      {
        specialist: "observability-investigator",
        verdict: "supports_mutation",
        reason: "error rate spiked",
      },
      {
        specialist: "deployment-investigator",
        verdict: "supports_mutation",
        reason: "diff matches symptom",
      },
      {
        specialist: "runbook-investigator",
        verdict: "supports_mutation",
        reason: "runbook recommends rollback",
      },
    ];

    expect(detectDisagreement(entries)).toEqual([]);
  });

  it("flags every disagreeing pair, preserving both reasons", () => {
    const entries: readonly VerdictEntry[] = [
      {
        specialist: "deployment-investigator",
        verdict: "supports_mutation",
        reason: "diff matches symptom",
      },
      {
        specialist: "security-reviewer",
        verdict: "against_mutation",
        reason: "evidence shows prompt injection",
      },
    ];

    const disagreements = detectDisagreement(entries);
    expect(disagreements).toHaveLength(1);
    expect(disagreements[0]).toEqual({
      specialists: ["deployment-investigator", "security-reviewer"],
      verdicts: ["supports_mutation", "against_mutation"],
      reasons: ["diff matches symptom", "evidence shows prompt injection"],
    });
  });

  it("flags all disagreeing pairs across more than two specialists", () => {
    const entries: readonly VerdictEntry[] = [
      {
        specialist: "observability-investigator",
        verdict: "supports_mutation",
        reason: "a",
      },
      {
        specialist: "deployment-investigator",
        verdict: "against_mutation",
        reason: "b",
      },
      {
        specialist: "runbook-investigator",
        verdict: "inconclusive",
        reason: "c",
      },
    ];

    const disagreements = detectDisagreement(entries);
    // All three pairs disagree: (obs,dep), (obs,runbook), (dep,runbook).
    expect(disagreements).toHaveLength(3);
  });

  it("returns no disagreements for a single specialist result", () => {
    const entries: readonly VerdictEntry[] = [
      {
        specialist: "verification-agent",
        verdict: "supports_mutation",
        reason: "recovered",
      },
    ];

    expect(detectDisagreement(entries)).toEqual([]);
  });
});
