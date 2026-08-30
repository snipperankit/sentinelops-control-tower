// Pure, deterministic disagreement detection across specialist verdicts
// (see ARCHITECTURE.md "Specialist disagreement: escalate or request more
// evidence", Phase 6 requirement "the commander must not hide conflicting
// results"). Pairwise comparison, no model call — a conflict can never be
// silently smoothed over by relying on the model to remember to mention it.
import type {
  SpecialistName,
  SpecialistVerdict,
} from "./specialist-result-schema.js";

export interface VerdictEntry {
  readonly specialist: SpecialistName;
  readonly verdict: SpecialistVerdict;
  readonly reason: string;
}

export interface DisagreementEntry {
  readonly specialists: readonly [SpecialistName, SpecialistName];
  readonly verdicts: readonly [SpecialistVerdict, SpecialistVerdict];
  readonly reasons: readonly [string, string];
}

/** Returns every pair of entries whose verdicts differ. Order-stable and side-effect-free. */
export function detectDisagreement(
  entries: readonly VerdictEntry[],
): readonly DisagreementEntry[] {
  const disagreements: DisagreementEntry[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      if (a.verdict !== b.verdict) {
        disagreements.push({
          specialists: [a.specialist, b.specialist],
          verdicts: [a.verdict, b.verdict],
          reasons: [a.reason, b.reason],
        });
      }
    }
  }
  return disagreements;
}
