// Combines specialist verdicts into one report for the commander. See
// ARCHITECTURE.md: "the commander must not hide conflicting results" — the
// `disagreements` field below is always present (an empty array when
// specialists agree), so there is no code path that can construct a
// `MultiSpecialistReport` while dropping it.
import {
  detectDisagreement,
  type DisagreementEntry,
  type VerdictEntry,
} from "./disagreement.js";

export interface MultiSpecialistReport {
  readonly specialistFindings: readonly VerdictEntry[];
  readonly disagreements: readonly DisagreementEntry[];
  readonly hasDisagreement: boolean;
}

export function aggregateSpecialistFindings(
  findings: readonly VerdictEntry[],
): MultiSpecialistReport {
  const disagreements = detectDisagreement(findings);
  return {
    specialistFindings: findings,
    disagreements,
    hasDisagreement: disagreements.length > 0,
  };
}
