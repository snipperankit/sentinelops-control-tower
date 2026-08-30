# 0004. Live incident session server (harness/server)

## Status

Accepted

## Context

AGENTS.md and `.github/copilot-instructions.md` require the implementation
to visibly demonstrate a real MCP tool call, generated code running in the
sandbox, a human approval pause before a mutating action, resumption after
approval, post-action verification, and an audit trail. Up to this point
the incident cockpit (`apps/cockpit`) only drove a deterministic
`ScriptedIncidentController` (see ADR 0003) — a fixed, narrated script with
no real tool calls, no real sandbox execution, no real policy
authorization, and no real mutation.

Wiring a live TrueForge LLM turn loop (`harness/agent/session.ts`,
`AgentSessionRunner`) into the cockpit would satisfy the "real investigation"
requirement most completely, but requires a reachable `TRUEFORGE_BASE_URL`
(unconfirmed in this environment) and untested handling of live
turn-streaming events. Every other building block this session needs —
MCP tool contracts, the Docker sandbox, the policy gateway, the demo world
mutation, and the audit/evidence graph — already exists, is independently
tested, and can be invoked in-process without any live transport.

## Decision

- Added `harness/server/contract.ts`: a wire contract (zod schemas) that
  mirrors `apps/cockpit/src/types.ts`'s `SessionViewModel` shape, kept
  deliberately un-imported across the cockpit/harness boundary (same
  decoupling convention as ADR 0003).
- Added `harness/server/incident-session.ts`: `LiveIncidentSession`, a real
  state machine that:
  - Gathers evidence via the real MCP tool contracts
    (`mcp/observability`, `mcp/deployments`, `mcp/incidents`), invoked
    in-process through each package's own `runTool()` — the same
    validate/execute/validate path a live MCP transport uses.
  - Runs a correlation diagnostic as generated code in the real
    Docker-isolated sandbox (`sandbox/runner.ts`), degrading to `blocked`
    if Docker is unreachable rather than falling back to unsandboxed
    execution.
  - Scans untrusted runbook text for prompt-injection patterns before
    treating it as reference material only (never as instructions).
  - Requests approval and, on `approve()`, authorizes the rollback through
    the real policy gateway (`policy/gateway.ts`) with a real one-time-use
    `ApprovalGrant`, then executes the real `deployments.rollback` mutation
    against the real file-backed demo world.
  - Re-queries real post-rollback metrics and only reaches `verified` if
    every independently recomputed signal passes.
  - Records every step in the real, hash-linked `EvidenceGraph`/
    `AuditChain` (`harness/audit`).
- Added `harness/server/http.ts`: a `node:http`-based HTTP + Server-Sent
  Events API (`createSessionApiServer`) exposing session creation, snapshot
  retrieval, a live event stream, and approve/reject/resume/emergency-stop
  actions. No Express or other framework was introduced, matching the
  repository's "no unnecessary frameworks" convention for this small, fixed
  route set.
- Cockpit side: extracted a shared `IncidentController` interface
  (`apps/cockpit/src/controller.ts`) implemented by both
  `ScriptedIncidentController` and a new `LiveSessionClient`
  (`apps/cockpit/src/liveSessionClient.ts`), which connects over
  fetch + `EventSource` and validates every incoming payload through the
  cockpit's existing `parseSessionViewModel`. `App.tsx` selects between the
  scripted controller (default) and the live client based on
  `VITE_SESSION_API_URL`, with a loading state while connecting.
- Explicitly deferred: the investigation narrative in `LiveIncidentSession`
  is not driven by a live TrueForge LLM turn loop. Specialist findings are
  synthesized directly from the real tool evidence gathered above, not from
  independent live TrueForge specialist sessions.

## Consequences

- Every non-LLM step in the incident lifecycle required by AGENTS.md is now
  genuinely executed against real, tested business logic — not narrated.
- `tests/unit/live-incident-session.test.ts` exercises the full real flow
  (investigate → approve → real rollback → real verification; reject →
  resume; emergency stop) against a temporary, isolated demo world and a
  `FixedClock`, including a real Docker sandbox execution.
- Sessions are held in an in-memory registry scoped to a single server
  process; restarting the process loses in-flight sessions. No persistence
  layer exists yet.
- Two real bugs were found and fixed while building this: an observability
  query window that exceeded the tool's enforced 6-hour maximum, and a
  synthetic approver identity (`"cockpit-operator"`) that was not in the
  policy gateway's authorized-approver allowlist (`"operator"`,
  `"admin"`, `"incident-commander"`).
- Follow-up: wire `AgentSessionRunner` into `runInvestigation()` once a
  reachable `TRUEFORGE_BASE_URL` is confirmed, so the investigation
  narrative and specialist findings are independently produced by live
  TrueForge sessions rather than synthesized from the gathered evidence.
