# Policy (policy/)

## Purpose

Risk classification, authorization, approval-binding enforcement, kill-switch behavior, scope enforcement, and audit events for the SentinelOps policy layer (see SECURITY.md, THREAT_MODEL.md, `.github/instructions/policy.instructions.md`).

## Scope

The deterministic security boundary between agent proposals and any mutating MCP adapter. Never trusts model output for authorization decisions. The `authorize()` gateway function in `gateway.ts` is the single entry point — the UI, the agent, and the MCP adapter must all pass through it.

## Security implications

This is the most security-critical directory in the repository. All mutation must pass through it and it must fail closed if unavailable.

## Implemented modules

- `errors.ts` — Typed `PolicyError` subclasses for every denial reason.
- `types.ts` — Core types: `RiskLevel`, `ToolRiskEntry`, `ApprovalRequest`, `ApprovalGrant`, `AuthorizationDecision`, `PolicyAuditEvent`, `InMemoryPolicyAuditSink`.
- `risk.ts` — Tool risk classification via a static tool allowlist. Unknown tools are denied. Read-only tools pass without approval; mutating/destructive tools require a valid `ApprovalGrant`.
- `scope.ts` — Session-bound environment scope enforcement and resource scope validation.
- `approval.ts` — Canonical argument serialization (sorted-key JSON), SHA-256 argument hashing, approval creation (with authorized-approver check), full binding validation (consumed, expired, session, tool, argument hash, environment, resource), `InMemoryApprovalStore`, 5-minute default TTL.
- `kill-switch.ts` — Global latch that instantly denies all mutations when activated.
- `gateway.ts` — `authorize()`: the 10-step policy pipeline. Fails closed on unexpected errors.

## Failure behavior

- Unknown tool → `UnknownToolError`.
- Missing approval for mutating tool → `ApprovalRequiredError`.
- Expired / reused / mismatched approval → specific typed error.
- Unauthorized approver → `UnauthorizedApproverError`.
- Kill switch active → `KillSwitchActiveError`.
- Policy service internal failure → `PolicyServiceUnavailableError` (fail closed).
- Cross-environment request → `ScopeMismatchError`.

Every denial emits a `PolicyAuditEvent` before throwing.

## Test or eval coverage

`tests/policy/policy-gateway.test.ts` — 17 tests covering: read-only pass-through, rollback denied before approval, correct approval permits exact rollback, changed deployment ID / environment / service rejected, expired / replayed approval rejected, unauthorized approver rejected, policy-service outage denies mutation, kill switch revokes/resumes authorization, UI bypass attempts rejected, canonical serialization determinism, approval session mismatch.

## Known limitations

Approval store, audit sink, and approver set are in-memory only. No HTTP/transport-level API for the approval flow yet. No rate limiting or budget enforcement yet.
