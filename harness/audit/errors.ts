// Typed errors for the evidence/audit layer (see
// FINAL_VALIDATION_CHECKLIST.md "Evidence and provenance", "Audit
// integrity"). Every rejection is a specific, structured error rather than
// a generic thrown string, mirroring policy/errors.ts's convention.

export abstract class AuditError extends Error {
  abstract readonly code: string;
}

export class MissingEvidenceProvenanceError extends AuditError {
  readonly code = "MISSING_EVIDENCE_PROVENANCE";
  constructor(readonly issues: readonly string[]) {
    super(
      `Evidence rejected: missing or invalid provenance (${issues.join(", ")})`,
    );
    this.name = "MissingEvidenceProvenanceError";
  }
}

export class UnknownEvidenceReferenceError extends AuditError {
  readonly code = "UNKNOWN_EVIDENCE_REFERENCE";
  constructor(readonly evidenceId: string) {
    super(`Reference to unknown evidence ID "${evidenceId}"`);
    this.name = "UnknownEvidenceReferenceError";
  }
}

export class UnknownHypothesisReferenceError extends AuditError {
  readonly code = "UNKNOWN_HYPOTHESIS_REFERENCE";
  constructor(readonly hypothesisId: string) {
    super(`Reference to unknown hypothesis ID "${hypothesisId}"`);
    this.name = "UnknownHypothesisReferenceError";
  }
}

export class MissingVersionComponentError extends AuditError {
  readonly code = "MISSING_VERSION_COMPONENT";
  constructor(readonly components: readonly string[]) {
    super(
      `Version manifest rejected: missing or invalid components (${components.join(", ")})`,
    );
    this.name = "MissingVersionComponentError";
  }
}
