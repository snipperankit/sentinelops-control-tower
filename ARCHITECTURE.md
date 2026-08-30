# SentinelOps Architecture

## Overview

SentinelOps is an agent control tower built on TrueForge.

TrueForge manages the agent runtime, model loop, sessions, MCP tools, sandbox execution, subagent delegation, and approval pauses.

SentinelOps adds:

- Incident-domain MCP servers.
- Risk-based policy enforcement.
- Evidence provenance.
- Human approval UX.
- Verification workflows.
- Evaluation and replay.
- Audit reporting.

## Logical architecture

```text
User
 |
 v
Incident Cockpit
 |
 v
TrueForge Runtime
 |
 +--> Incident Commander
 |      |
 |      +--> Observability Investigator
 |      +--> Deployment Investigator
 |      +--> Runbook Investigator
 |      +--> Security Reviewer
 |      +--> Verification Agent
 |
 +--> Read-only MCP tools
 +--> Sandbox
 +--> Approval checkpoint
 |
 v
Policy and Tool Gateway
 |
 +--> Observability MCP
 +--> Deployment MCP
 +--> Runbook MCP
 +--> Rollback MCP
 |
 v
Deterministic Demo Environment
```

## Control flow

```text
receive incident
  -> create scoped session
  -> gather read-only evidence
  -> delegate specialist analysis
  -> run diagnostics in sandbox
  -> synthesize evidence
  -> challenge hypothesis
  -> construct action proposal
  -> policy classifies action
  -> request human approval
  -> validate exact approval
  -> execute mutation
  -> run independent verification
  -> persist audit report
```

## Agent boundaries

### Commander

Can:

- Start investigation.
- Delegate.
- Read evidence.
- Request approval.
- Request verification.

Cannot:

- Directly mutate state.
- Approve its own request.
- Bypass policy.

### Investigators

Can:

- Read assigned evidence.
- Use assigned read-only tools.
- Return structured findings.

Cannot:

- Mutate systems.
- Approve actions.
- Expand their own tool permissions.

### Security reviewer

Can:

- Inspect evidence.
- Inspect proposed action.
- Inspect policy result.

Cannot:

- Execute mutations.

### Verification agent

Can:

- Use read-only verification tools.
- Produce recovery status.

Cannot:

- Repair or mutate systems.

### Enforcement (implemented)

The boundaries above are enforced structurally, not only by prompt wording:

- Each specialist's `AgentSpec` (`harness/agent/specialists.ts`) attaches an
  explicit literal tool allowlist per connector (never `@all`); the security
  reviewer has no connector at all.
- No specialist spec enables `dynamicSubAgents`, so specialists have no
  runtime mechanism to delegate further.
- Delegation from the commander is bounded and tracked at runtime by
  `harness/agent/delegation.ts` (`DelegationTracker`/`DelegationCoordinator`):
  a maximum delegation depth, a maximum total delegation count, rejection of
  delegation loops, and an independent cross-check of each specialist's
  self-reported `toolsUsed` against its static allowlist.
- Specialist disagreement is preserved rather than resolved silently:
  `harness/agent/disagreement.ts` and `harness/agent/aggregate.ts` guarantee
  the commander's aggregated report always includes every specialist's
  findings and a `disagreements` field (empty when they agree).

### Evidence provenance and audit chain (implemented)

`harness/audit/` implements the evidence model and audit trail described
above:

- `EvidenceStore` (`harness/audit/evidence.ts`) assigns every evidence item a
  unique ID and records its source tool, query, observed timestamp, trust
  classification (`trusted` / `untrusted`), interpretation, and a SHA-256
  hash of its (redacted) result. It has no update or delete method, so
  recorded evidence can never be rewritten; `verifyEvidenceIntegrity()`
  detects modification by recomputing the hash, and `replay()` makes
  evidence replayable.
- `EvidenceGraph` (`harness/audit/graph.ts`) links evidence to hypotheses,
  hypotheses to proposed actions, and approval requests to evidence IDs
  (referencing the policy layer only by an opaque `approvalRequestId`, never
  importing `policy/` types). Ruled-out hypotheses are recorded, not
  deleted, so alternative hypotheses are always preserved.
- `AuditChain` (`harness/audit/chain.ts`) is an append-only, hash-linked
  event chain: each entry's hash covers the previous entry's hash, so
  `verifyChainIntegrity()` can detect any modified or reordered entry.
  Sensitive fields are redacted (`harness/audit/redaction.ts`) before an
  entry is hashed or stored.
- `buildVersionManifest()` (`harness/audit/versions.ts`) validates that the
  agent, model, policy, tool, sandbox, approval, mutation, and verification
  versions are all present before a session records them as an audit event.

### Incident cockpit (implemented, scripted state source)

`apps/cockpit` implements the Incident Cockpit UI shown in the diagram
above, as an independent npm package (its own React/Vite/TypeScript/Vitest/
Playwright/ESLint tooling, excluded from the root's Node-oriented
`tsconfig.json`/`eslint.config.js`):

- `src/types.ts` defines a zod-validated `SessionViewModel` — the single
  contract every component renders from. It is not a direct import of
  `harness/`/`policy/` types, matching the existing decoupling convention
  between layers.
- `src/approval.ts`'s `evaluateApprovalGate` structurally enforces the
  approval-checkpoint rules: disabled on expiry, argument mismatch, wrong
  session state, or policy-service unavailability.
- `src/sessionController.ts`'s `ScriptedIncidentController` currently stands
  in for a live TrueForge session client, driving the exact required
  10-state flow deterministically for development and the Playwright e2e
  suite. It never calls a mutation tool directly. Replacing it with a real
  session client is a defined follow-up (see
  [docs/adr/0003-incident-cockpit-app.md](docs/adr/0003-incident-cockpit-app.md)).

## Trust boundaries

1. User input.
2. Model-generated plans.
3. Tool outputs.
4. Retrieved documents.
5. Generated sandbox code.
6. Policy service.
7. Mutation adapter.
8. Audit store.

## Data classifications

- Public demo metadata.
- Internal operational metadata.
- Sensitive operational data.
- Secrets and credentials.

Secrets must never enter the agent context or sandbox.

## Mutation path

The only valid mutation path is:

```text
approval UI
  -> TrueForge session resume
  -> policy authorization
  -> exact argument validation
  -> scoped MCP mutation adapter
  -> post-action verification
  -> audit event
```

## Failure behavior

- Unknown tool: deny.
- Invalid arguments: reject.
- Policy unavailable: deny mutation.
- Approval expired: reject.
- Approval reused: reject.
- Tool timeout: return structured failure.
- Verification failure: mark action unverified and escalate.
- Audit failure: do not hide the failure; preserve local session state and mark audit incomplete.
- Specialist disagreement: escalate or request more evidence.
