# Session API server (`harness/server/`)

## Purpose

Wires the incident cockpit to a **real** incident session instead of the scripted demo controller (`apps/cockpit/src/sessionController.ts`). Exposes `LiveIncidentSession` over a small HTTP + Server-Sent Events API.

## What is real here

Every step performs a genuine operation against already-implemented, independently tested code:

- **Evidence**: real MCP tool contracts (`mcp/observability`, `mcp/deployments`, `mcp/incidents`), invoked in-process via each package's own `runTool()` — the same validation/execution path a live MCP transport uses.
- **Sandbox**: the correlation diagnostic runs as generated code in the real Docker-isolated sandbox (`sandbox/runner.ts`). Degrades to `blocked` if Docker is unreachable — never falls back to running on the host.
- **Authorization**: the real policy gateway (`policy/gateway.ts`), exercising the full 10-step pipeline against a real, one-time-use approval grant.
- **Mutation**: the real `deployments.rollback` tool contract, applied to the real (file-backed) demo world (`harness/demo`).
- **Verification**: re-queries the real post-rollback demo world state; the session only reaches `verified` if every signal independently passes.
- **Audit**: evidence, hypotheses, proposed actions, and audit entries are recorded in the real, hash-linked `EvidenceGraph` / `AuditChain` (`harness/audit`).

## Known limitations

- The investigation narrative is **not** yet driven by a live TrueForge LLM turn loop (`harness/agent/session.ts`, `AgentSessionRunner`). Specialist findings in the view model are synthesized directly from the real tool evidence gathered above, not from independent live TrueForge specialist sessions. Wiring a real `AgentSessionRunner.startInvestigation()` call into `runInvestigation()` is the natural next step once a reachable `TRUEFORGE_BASE_URL` is confirmed (see harness/README.md).
- Sessions are held in an in-memory `Map`, scoped to a single server process. Restarting the process loses all in-flight sessions. No persistence layer exists yet.
- One demo world (`harness/demo`) is shared process-wide; starting a new incident (`POST /api/incidents`) resets and reseeds it, so only one incident can be meaningfully "in flight" at a time.
- CORS is permissive-by-default for local development (`SESSION_API_CORS_ORIGIN`, default the Vite dev server origin) — this server is not intended to be exposed beyond localhost as-is.

## API

- `POST /api/incidents` → `{ sessionId }`. Resets and reseeds the demo world, then starts investigation round 1 in the background.
- `GET /api/incidents/:id` → current `SessionViewModelWire` snapshot.
- `GET /api/incidents/:id/stream` → Server-Sent Events; each event's `data` is a full `SessionViewModelWire` snapshot, sent on every state change.
- `POST /api/incidents/:id/approve` → authorizes and executes the real rollback, then verifies.
- `POST /api/incidents/:id/reject` (body `{ reason }`) → rejects the pending approval.
- `POST /api/incidents/:id/resume` → starts investigation round 2.
- `POST /api/incidents/:id/emergency-stop` → engages the kill switch for this session; idempotent from a terminal state.

## Wire contract

`contract.ts` mirrors `apps/cockpit/src/types.ts`'s `SessionViewModel` shape. The two are intentionally not imported across the cockpit/harness package boundary (different tsconfigs, module resolution, and runtime targets) — keep both in sync by hand when the shape changes.

## Running locally

```bash
npm run session:server
```

Then point the cockpit at it: `apps/cockpit/.env.local` with `VITE_SESSION_API_URL=http://localhost:8810`, and run `npm run cockpit:dev`.

## Test coverage

`tests/unit/live-incident-session.test.ts` exercises the full real flow (investigate → approve → execute → verify, and investigate → reject → resume → approve) against a temporary, isolated `DemoWorldStore` and a `FixedClock`. The sandbox diagnostic step degrades gracefully (`blocked`/`error`) if Docker is unavailable in the test environment rather than failing the whole investigation.
