# 0002. Evidence provenance and the incident evidence graph

## Status

Accepted

## Context

FINAL_VALIDATION_CHECKLIST.md requires a concrete evidence model (unique ID,
source, query, observed timestamp, trust classification, result/result hash,
interpretation), an evidence graph linking evidence to hypotheses, hypotheses
to proposed actions, and approval requests to evidence, plus a tamper-evident
session audit trail recording agent/model/policy/tool/sandbox/approval/
mutation/verification versions. AGENTS.md's non-negotiable safety rules
additionally require that source evidence can never be rewritten by the
model, and SECURITY.md's "Audit security" section requires event hashes and
redaction of sensitive fields before persistence. None of this existed yet;
the commander/specialist orchestration (`harness/agent/`) only carried a
lighter, per-turn `evidence` array (`harness/agent/result-schema.ts`) with no
IDs, hashing, or graph structure.

## Decision

- New `harness/audit/` module, sibling to `harness/agent/` and
  `harness/demo/`, since evidence/audit is a session-scoped cross-cutting
  concern within the harness's documented scope ("sessions, events, and
  approval-resume handling").
- `EvidenceStore` (`evidence.ts`) is the single source of truth for evidence
  items. It validates provenance with zod, rejecting anything incomplete
  rather than recording a partial item; redacts sensitive fields
  (`redaction.ts`) before ever hashing or storing a result; and computes a
  SHA-256 `resultHash` over canonical (key-sorted) JSON. It exposes no
  update or delete method — this is the structural mechanism (not a prompt
  instruction) that guarantees recorded evidence can never be rewritten.
  `verifyEvidenceIntegrity()` recomputes the hash to detect modification;
  `replay()` returns the stored item plus a live integrity check.
- `EvidenceGraph` (`graph.ts`) links evidence to hypotheses, hypotheses to
  proposed actions, and approval requests to evidence IDs. It validates every
  referenced ID exists before recording a link, rejecting unknown references.
  Approval requests are referenced only by an opaque `approvalRequestId`
  string, never by importing `policy/` types — `harness/` and `policy/`
  remain decoupled, matching the rest of the codebase (verified: no existing
  file imports across that boundary). Ruled-out hypotheses are recorded with
  `ruledOut: true` and a `reason`, never deleted, so alternative hypotheses
  are always preserved.
- `AuditChain` (`chain.ts`) is a separate, generic, append-only hash-linked
  event chain (not evidence-specific) so it can also carry version-manifest
  and other session-lifecycle events. Each entry's hash covers the previous
  entry's hash (`GENESIS_HASH` for the first entry); `verifyChainIntegrity()`
  recomputes the chain to detect a modified, removed, or reordered entry.
  Payloads are redacted before being hashed or stored. No update or delete
  method exists.
- `versions.ts` validates a complete version manifest (agent, model, policy,
  tool, sandbox, approval, mutation, verification) via zod, throwing
  `MissingVersionComponentError` on any missing/empty component. It has no
  dedicated recording method on `AuditChain`; callers append it as a normal
  chain event, keeping `AuditChain` generic rather than evidence-specific.
- `hash.ts`'s canonical-JSON/SHA-256 helpers intentionally duplicate (rather
  than import) `policy/approval.ts`'s existing canonicalization pattern, to
  avoid introducing a `harness/` → `policy/` dependency for a small amount of
  shared logic.
- Tamper-evidence and "cannot rewrite" are both achieved purely by omitting
  mutation methods and by hash comparison — not by runtime `Object.freeze`
  or deep-clone-on-every-read machinery, to avoid over-engineering a demo
  system.

## Consequences

- `harness/audit/` is fully unit-tested (`tests/unit/evidence.test.ts`,
  `evidence-graph.test.ts`, `redaction.test.ts`, `audit-chain.test.ts`,
  `version-manifest.test.ts`) but not yet wired into
  `harness/agent/session.ts` or the specialist delegation flow. A follow-up
  change must call `EvidenceStore.record()`/`EvidenceGraph` methods from the
  live investigation flow and `AuditChain.append()` from the policy approval
  and mutation-execution paths so real sessions populate the graph and chain.
- Because tamper-evidence is hash-based rather than storage-enforced (there
  is no persistent store yet — everything is in-memory), a caller with
  direct access to the process could still, in principle, construct a
  fabricated `AuditChain`/`EvidenceStore` instance from scratch; the current
  guarantee is "cannot rewrite existing entries through this API", not
  "cannot be bypassed by an attacker with code execution in the same
  process". This matches the sandbox/policy boundary already documented in
  THREAT_MODEL.md (mitigations assume the trust boundaries are respected,
  not that every process-internal actor is hostile).

## Security implications

Directly implements SECURITY.md's "Audit security" requirements (event
hashes, redaction before persistence) and the THREAT_MODEL.md "Audit
tampering → Hash-linked events" and "Malicious runbook → Provenance and
trusted-source classification" mitigations. Evidence trust classification
(`trusted` / `untrusted`) is recorded but this module does not itself act on
it (e.g. it does not scan or block untrusted content) — that remains the
responsibility of `harness/agent/prompt-injection-scan.ts` and the
commander/specialist prompts, which must continue to treat `untrusted`
evidence as data, never instructions.
