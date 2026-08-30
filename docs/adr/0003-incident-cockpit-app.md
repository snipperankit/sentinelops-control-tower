# 0003. Incident cockpit as an independent app with a scripted session controller

## Status

Accepted

## Context

PRODUCT_SPEC.md and ARCHITECTURE.md describe an incident cockpit UI showing
incident title/severity, the current agent phase, a live event timeline,
tool calls, an evidence panel, specialist findings, sandbox status, the
current hypothesis, confidence/uncertainty, an approval card with expiry, a
verification status, residual risk, an audit trail, and an emergency stop.
`.github/instructions/frontend.instructions.md` requires the exact 10-state
lifecycle (`investigating` ... `stopped`), that approval details are
rendered only from validated policy data, that approval controls are
disabled when expired or mismatched, that no mutating tool is ever called
directly from the UI, and that the approval checkpoint is impossible to
miss. `apps/cockpit` previously only contained a placeholder `README.md` —
no framework, components, or tests existed, and no live TrueForge session
client is wired up yet for the UI layer.

## Decision

- `apps/cockpit` is scaffolded as a fully independent npm package: its own
  `package.json`, `tsconfig.json` (`jsx: react-jsx`, `moduleResolution:
Bundler`, DOM libs), Vite config, Vitest config (`jsdom` environment),
  Playwright config, and ESLint flat config — kept out of the root's
  Node-oriented `tsconfig.json`/`eslint.config.js` (both now explicitly
  exclude/ignore `apps/cockpit`) so the two toolchains never collide.
- `src/types.ts` defines a single, zod-validated `SessionViewModel` as the
  only shape any component ever renders from — including nested
  `ApprovalCardView`, `VerificationResultView`, `SpecialistFindingView`, and
  `AuditTrailEntryView` schemas. It is deliberately **not** an import of
  `harness/`/`policy/` TypeScript types (matching the existing
  `harness`/`policy` decoupling convention): the cockpit mirrors the shape of
  `policy/types.ts`'s `ApprovalRequest`/`ApprovalGrant` structurally, but
  defines and validates its own contract at the UI boundary.
- The approval-gating rules (disable on expiry, argument mismatch, wrong
  session state, policy-service unavailability, rejection, or consumption)
  are extracted into a single pure function, `evaluateApprovalGate`, so they
  are unit-testable independent of React and reused identically by both
  `ApprovalCard`'s disabled-state logic and the session controller's
  `approve()` guard.
- Because no live TrueForge session wiring exists yet, `sessionController.ts`
  implements a `ScriptedIncidentController`: a deterministic, in-memory state
  machine that walks the exact required flow (`investigating -> analyzing ->
awaiting_approval -> rejected -> analyzing -> awaiting_approval -> approved
-> executing -> verifying -> verified`) and exposes `subscribe`, `advance`,
  `approve`, `reject`, `resume`, and `emergencyStop`. This mirrors the
  "fake client / injectable clock" testability pattern already used by
  `TrueForgeClientLike` (`harness/agent/session.ts`) and `FixedClock`
  (`harness/demo/clock.ts`). `emergencyStop` never calls a mutation tool; it
  only transitions local view state and marks any pending approval consumed.
- Ten presentational components render one required UI section each
  (`IncidentHeader`, `AgentPhaseTracker`, `EventTimeline`, `EvidencePanel`,
  `HypothesisPanel`, `ConfidencePanel`, `SpecialistFindings`,
  `SandboxStatusPanel`, `VerificationPanel`, `AuditTrailPanel`,
  `ApprovalCard`); none of them import an MCP client or policy service —
  they only receive view data and callbacks as props.
- Root `package.json` gained `cockpit:install`/`cockpit:dev`/`cockpit:build`/
  `cockpit:lint`/`cockpit:typecheck`/`cockpit:test`/`cockpit:test:e2e` proxy
  scripts (each using `--prefix apps/cockpit`) so the app is discoverable
  and runnable from the repo root without merging its tooling into root
  config.

## Consequences

- The cockpit's UI, safety rules, and full required test coverage (10 unit
  tests for the approval gate, 6 for the controller state machine, 18
  component tests across `ApprovalCard`/`VerificationPanel`/
  `EvidencePanel`/`IncidentHeader`/`App`, and a 2-scenario Playwright e2e
  suite covering the full flow plus emergency stop) can be built and
  validated today without any live backend.
- Replacing `ScriptedIncidentController` with a real TrueForge session
  client is a defined, isolated follow-up: any replacement need only satisfy
  the same `getState`/`subscribe`/`advance`/`approve`/`reject`/`resume`/
  `emergencyStop` interface for the rest of the app (components, tests) to
  keep working unchanged.
- Because `apps/cockpit` is a separate npm package, it has its own
  `node_modules`, its own dependency versions (e.g. its own `eslint`,
  `typescript`), and its own CI/validation commands — this trades a single
  unified toolchain for isolation and independent upgrade cadence.
- `eslint-plugin-react-hooks@^4.6.2` (originally proposed) does not support
  ESLint 9's peer range; the package.json was corrected to `^5.1.0` before
  `npm install` succeeded.

## Security implications

Directly implements SECURITY.md/AGENTS.md's "no direct UI-to-mutation path"
and "human approval must bind to the exact tool name and canonicalized
arguments" rules at the UI layer: `ApprovalCard` only ever renders fields
already present on a validated `ApprovalCardView` and only ever calls
`onApprove`/`onReject` callbacks — it has no code path to invoke a tool
itself. `evaluateApprovalGate` structurally (not just via a prompt or
convention) disables approval on expiry, argument mismatch, wrong session
state, or policy-service unavailability, and the blocked reasons are
rendered visibly rather than swallowed. `VerificationPanel` only displays a
status derived from a structured `VerificationResultView`, never from
free-text, so the "never display success from model text alone" rule is
enforced at the component boundary and is covered by
`VerificationPanel.test.tsx`.
