// Barrel export for the evidence provenance / audit layer (see
// FINAL_VALIDATION_CHECKLIST.md "Evidence and provenance", "Audit and
// observability").
export {
  EvidenceStore,
  verifyEvidenceIntegrity,
  type EvidenceId,
  type EvidenceTrustClassification,
  type EvidenceInput,
  type EvidenceItem,
  type EvidenceReplay,
} from "./evidence.js";
export { redactSensitiveFields, isSensitiveFieldName } from "./redaction.js";
export {
  EvidenceGraph,
  type HypothesisId,
  type Hypothesis,
  type HypothesisInput,
  type ProposedActionId,
  type ProposedAction,
  type ProposedActionInput,
  type ApprovalEvidenceLink,
} from "./graph.js";
export {
  AuditChain,
  GENESIS_HASH,
  type AuditChainEventInput,
  type AuditChainEntry,
  type ChainIntegrityResult,
} from "./chain.js";
export {
  buildVersionManifest,
  type VersionManifest,
  type VersionManifestInput,
} from "./versions.js";
export {
  AuditError,
  MissingEvidenceProvenanceError,
  UnknownEvidenceReferenceError,
  UnknownHypothesisReferenceError,
  MissingVersionComponentError,
} from "./errors.js";
