# Incident Cockpit (apps/cockpit)

## Purpose

The incident cockpit is the human-facing surface for SentinelOps. It renders
incident state, evidence, specialist findings, sandbox status, hypotheses,
confidence, the approval checkpoint, verification results, and the audit
trail described in PRODUCT_SPEC.md, ARCHITECTURE.md, and SECURITY.md. It is a
self-contained npm package (own `package.json`, TypeScript, Vite, Vitest, and
Playwright config) so it can evolve independently of the root Node/harness
tooling.

## Scope

User-facing rendering only:

- `src/types.ts` — the single, zod-validated `SessionViewModel` contract every
  component renders from. Untrusted until parsed (`parseSessionViewModel`).
- `src/approval.ts` — pure, unit-tested enforcement of the approval-gating
  rules (expiry, argument mismatch, wrong session state, policy
  unavailability).
- `src/components/*` — presentational components, one per required UI
  section (incident header, phase tracker, event timeline, evidence panel,
  hypothesis panel, confidence panel, specialist findings, sandbox status,
  verification panel, audit trail, approval card).
- `src/sessionController.ts` — a deterministic `ScriptedIncidentController`
  that drives the demo flow (`investigating -> analyzing -> awaiting_approval
-> rejected -> analyzing -> awaiting_approval -> approved -> executing ->
verifying -> verified`) until the cockpit is wired to a live TrueForge
  session. It never calls a mutation tool — it only updates local view state.

No component calls a mutating tool, an MCP adapter, or the policy service
directly. All of that lives in `harness/` and `policy/`; this app only
renders structured session state and forwards user decisions (approve,
reject, resume, emergency stop) to whatever session driver is wired in.

## Assumptions

- There is no live TrueForge session wiring yet. `ScriptedIncidentController`
  stands in for it so the required UI flow, states, and safety rules can be
  built, tested, and demoed end-to-end. Replacing it with a real session
  client should only require implementing the same `subscribe`/`advance`/
  `approve`/`reject`/`resume`/`emergencyStop` interface.
- All approval data rendered by `ApprovalCard` is assumed to already be
  policy-validated (see `policy/types.ts` for the shape it mirrors); the UI
  independently re-checks expiry against the client clock but never invents
  or upgrades approval status itself.

## Security implications

- **No direct UI-to-mutation path**: components only ever call
  `onApprove`/`onReject`/`onResume`/`onEmergencyStop` callbacks; none of them
  import or invoke an MCP client or policy service directly.
- **Approval cannot be missed**: `ApprovalCard` renders with `role="alert"`
  and a distinct visual treatment whenever a decision is pending.
- **Approval cannot be forced through invalid state**: `evaluateApprovalGate`
  (in `src/approval.ts`) disables the Approve control when the approval is
  missing, expired (by status or by client clock), mismatched, rejected,
  consumed, the session isn't `awaiting_approval`, or the policy service is
  reported unavailable — and the disabled reasons are rendered, not hidden.
- **No success without structured evidence**: `VerificationPanel` only ever
  renders "passed"/"failed"/"pending" from a `VerificationResultView`; there
  is no code path that infers success from a free-text summary or model
  message.
- **No secrets or unnecessary personal data**: fixtures and view models carry
  only incident/evidence/approval metadata already scoped for the demo (see
  SECURITY.md); no credentials, tokens, or customer PII fields exist in
  `SessionViewModel`.

## Failure behavior

- If a `SessionViewModel` fails zod validation, `parseSessionViewModel`
  throws rather than rendering a partially-trusted view.
- If the policy service is reported unavailable (`policyAvailable: false`),
  the approval control is disabled regardless of any other field's value.
- Emergency stop is a no-op (not an error) when the session is already
  terminal (`verified`, `failed`, `stopped`).

## Test or eval coverage

- Unit tests: `src/approval.test.ts` (10 cases covering every disable
  condition), `src/sessionController.test.ts` (6 cases covering the full
  required flow, invalid-transition errors, subscriber lifecycle, and
  emergency stop).
- Component tests (Vitest + React Testing Library): `ApprovalCard.test.tsx`,
  `VerificationPanel.test.tsx`, `EvidencePanel.test.tsx`,
  `IncidentHeader.test.tsx`, `App.test.tsx` (36 tests total, run via
  `npm test`).
- End-to-end test (Playwright): `e2e/incident-flow.spec.ts` drives a real
  Chromium browser through investigation -> approval -> rejection -> resume
  -> approval -> execution -> verification, and a second scenario covering
  emergency stop from a non-terminal phase (`npm run test:e2e`, requires
  `npm run build` first so the Playwright config can preview `dist/`).

## Known limitations

- Session state comes from a scripted, in-memory controller, not a live
  TrueForge session — this is the primary gap before this becomes the real
  incident cockpit.
- No authentication/authorization of the cockpit user themselves is
  implemented; the demo assumes a single trusted operator.
- No persistence: refreshing the page restarts the scripted flow from
  `investigating`.
