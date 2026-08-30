# Evals (evals/)

## Purpose

Evaluation cases, graders, replay, and reports for the assembled SentinelOps runtime (see EVALS.md).

## Scope

`smoke/`, `core/`, `adversarial/`, and `replay/` suites, each holding a `cases.json` case list consumed by `runner.ts` and invoked via `npm run eval:<suite>`.

## Assumptions

`evals/smoke/cases.json` (6 cases) and `evals/adversarial/cases.json` (2 cases) are backed by executable graders (`smoke/graders.ts`, `adversarial/graders.ts`) that exercise real, deterministic application code — `LiveIncidentSession` with a mock (no-network) TrueForge client, the real policy gateway (`authorize`, `createApproval`, `ApprovalArgumentMismatchError`), and the real Docker-backed `runSandboxExecution()` — so these two suites produce genuine pass/fail results without any LLM key. `evals/core/cases.json` (7 cases) describes specialist _model-behavior_ expectations that can only be honestly graded by observing a live model's output; `core/graders.ts` reports every case `skipped` with a clear reason rather than fabricating a result, pending a live-model execution engine. `replay/` remains an empty placeholder (`cases.json: []`).

## Security implications

Adversarial and safety cases (prompt injection, sandbox escape, approval replay) are release-blocking per EVALS.md and must reach 100% safety compliance before submission.

## Failure behavior

`runner.ts` dispatches each case in `smoke`/`adversarial` to its registered grader (`core` always uses `gradeCoreCase`) and prints a `[PASS]`/`[FAIL]`/`[SKIP]` line with a reason per case, plus a summary count. It exits non-zero only when at least one case's grader reports `status: "fail"` (including an uncaught grader exception, which is treated as a fail). Cases with no registered grader, and all current `core` cases, report `skipped` and do not affect the exit code — skipped is never conflated with passed. An empty suite (`cases.json: []`) exits 0 with a placeholder-pass message so CI stays green during bootstrap.

## Test or eval coverage

This directory _is_ the eval coverage; see EVALS.md for tiers and thresholds. `evals/core/cases.json` has one case per specialist (observability, deployment, runbook ×2, security, verification) plus a commander disagreement-preservation case. `evals/adversarial/cases.json` has an infinite-delegation-attempt case and an unauthorized-tool-access-attempt case, both directly backed by the structural enforcement in `harness/agent/delegation.ts` and unit-tested in `tests/unit/delegation.test.ts`.

## Known limitations

`core/` cases are always `skipped`, never executed — there is no live-model execution engine wired in yet, so specialist-behavior claims (e.g. "identifies the error-rate anomaly", "detects prompt injection in evidence") remain unverified until a real TrueForge model is configured and a live-specialist grading path is built. Do not treat `skipped` as `passed` when reading eval output or reports. `replay/` remains an empty placeholder with no cases yet. Grader case names in `smoke/graders.ts` and `adversarial/graders.ts` must exactly match the `name` field in the corresponding `cases.json`, or the runner reports "no executable grader registered" (skipped) instead of running the check — there is no compile-time link between the two.
