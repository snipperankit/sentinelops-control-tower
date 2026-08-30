# Decisions Log

A running, append-only log of notable technical and product decisions. For decisions with lasting architectural impact, also add a full ADR under [docs/adr/](docs/adr/) using the standard `NNNN-title.md` naming convention, and link it here.

Format for each entry:

```
## YYYY-MM-DD — Short title
**Context:** why this decision was needed
**Decision:** what was decided
**Consequences:** trade-offs, follow-ups
**ADR:** link to docs/adr/NNNN-*.md if applicable
```

---

## Template entry (remove once real decisions are logged)

**Context:** Example placeholder — replace with the first real decision (e.g., choice of MCP tool framework, LLM provider, sandbox technology).
**Decision:** N/A
**Consequences:** N/A
**ADR:** N/A

## 2026-08-23 — Bootstrap toolchain and repository skeleton

**Context:** Needed the smallest runnable TypeScript repository skeleton matching the directory boundaries in AGENTS.md before implementing agent, MCP, sandbox, or UI behavior.
**Decision:** Single npm package with strict TypeScript, Vitest for all suites (including a placeholder `tests/e2e`), `tsx` for running scripts, ESLint flat config, JSON-fixture demo world, and placeholder `evals/*` cases so all required npm scripts are runnable immediately.
**Consequences:** Fast bootstrap with zero heavy dependencies (no browsers, no DB); `test:e2e` and `eval:*` are placeholders until real agent/UI/eval-case logic exists.
**ADR:** [docs/adr/0001-bootstrap-toolchain.md](docs/adr/0001-bootstrap-toolchain.md)

## 2026-08-24 — Evidence provenance and the incident evidence graph

**Context:** FINAL_VALIDATION_CHECKLIST.md's evidence model/graph and audit-integrity requirements, plus AGENTS.md's "never rewrite source evidence" rule, had no implementation yet.
**Decision:** New `harness/audit/` module: `EvidenceStore` (unique-ID, hashed, redacted, no update/delete method), `EvidenceGraph` (evidence→hypothesis→action and approval→evidence links, validated by ID, alternative hypotheses preserved), `AuditChain` (append-only, hash-linked, tamper-detectable), and `buildVersionManifest()` (agent/model/policy/tool/sandbox/approval/mutation/verification versions).
**Consequences:** Fully unit-tested but not yet wired into the live investigation/approval flow — a follow-up must call it from `harness/agent/session.ts`, specialist delegation, and the policy/mutation paths.
**ADR:** [docs/adr/0002-evidence-provenance-and-audit-chain.md](docs/adr/0002-evidence-provenance-and-audit-chain.md)

## 2026-08-24 — Incident cockpit as an independent app with a scripted session controller

**Context:** PRODUCT_SPEC.md, ARCHITECTURE.md, SECURITY.md, and `.github/instructions/frontend.instructions.md` require a cockpit UI covering the full 10-state incident lifecycle, an unmissable approval checkpoint, and structural (not model-text) evidence of success — before any live TrueForge session wiring exists for the UI.
**Decision:** Scaffolded `apps/cockpit` as a fully independent npm package (own React/Vite/TypeScript/Vitest/Playwright/ESLint config, decoupled from root Node-oriented tooling). Defined an independent, zod-validated `SessionViewModel` contract (not a direct import of `harness`/`policy` types) as the only shape components render from. Extracted the approval-gating rules into a pure `evaluateApprovalGate` function. Implemented a deterministic `ScriptedIncidentController` state machine (mirroring the `TrueForgeClientLike`/`FixedClock` fake-client testability pattern already used in `harness/`) to drive the demo flow until a live session client exists.
**Consequences:** The UI, its safety rules, and its full required test coverage (unit + component + Playwright e2e) can be built and validated today without a live backend; replacing `ScriptedIncidentController` with a real TrueForge session client is a defined follow-up that only needs to satisfy the same `subscribe`/`advance`/`approve`/`reject`/`resume`/`emergencyStop` interface. Root `tsconfig.json`/`eslint.config.js` exclude `apps/cockpit` so the two toolchains don't collide; root `package.json` gained `cockpit:*` proxy scripts.
**ADR:** [docs/adr/0003-incident-cockpit-app.md](docs/adr/0003-incident-cockpit-app.md)

## 2026-08-24 — Live incident session server (harness/server)

**Context:** The cockpit's `ScriptedIncidentController` proved the UI/UX and safety-gating logic, but AGENTS.md's required demonstrations (a real MCP tool call, generated code in the sandbox, a human approval pause, resumption, post-action verification, an audit trail) were not yet backed by real execution. A live TrueForge LLM turn loop requires a reachable `TRUEFORGE_BASE_URL`, which is not confirmed in this environment, and parsing untested live turn-streaming events carries real implementation risk.
**Decision:** Built `harness/server/`: `LiveIncidentSession`, a real (non-scripted) state machine that invokes the MCP tool contracts in-process via each package's own `runTool()`, runs a correlation diagnostic in the real Docker sandbox, authorizes the rollback through the real policy gateway (`policy/gateway.ts`), executes the real `deployments.rollback` mutation against the real file-backed demo world, and re-queries real post-rollback metrics for verification — all recorded in the real `EvidenceGraph`/`AuditChain`. Exposed over a small `node:http`-based HTTP + Server-Sent Events API (`http.ts`), with the cockpit consuming it through a new `LiveSessionClient` that implements the same `IncidentController` interface as `ScriptedIncidentController` (extracted into `apps/cockpit/src/controller.ts`), selected via `VITE_SESSION_API_URL`. Live TrueForge LLM-driven investigation narrative is explicitly deferred; specialist findings are synthesized from the real tool evidence gathered in this phase.
**Consequences:** Every non-LLM step in the incident lifecycle is now genuinely executed, not narrated — this is a real, testable improvement in fidelity. `tests/unit/live-incident-session.test.ts` exercises the full flow (including the real sandbox and real rollback) against a temporary, isolated demo world. Two real bugs were caught and fixed during this work: an out-of-range observability query window, and an unauthorized synthetic approver identity. Follow-up: wire `AgentSessionRunner`/`harness/agent/session.ts` into `runInvestigation()` once a reachable TrueForge server is confirmed; add persistence for sessions (currently in-memory, single-process).
**ADR:** [docs/adr/0004-live-incident-session-server.md](docs/adr/0004-live-incident-session-server.md)

## Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [docs/adr/](docs/adr/)
