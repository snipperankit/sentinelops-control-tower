# 0001. Bootstrap toolchain and repository skeleton

## Status

Accepted

## Context

SentinelOps needed the smallest runnable TypeScript skeleton matching the directory boundaries in AGENTS.md, before any agent, MCP, sandbox, or UI behavior is implemented. The toolchain had to be strict-TypeScript-compatible and runnable on Node 20 immediately after `npm install`, without heavy setup such as a Playwright browser install or a database server.

## Decision

- Single npm package at the repository root (no workspaces yet), `"type": "module"`, strict `tsconfig.json`.
- Vitest for all test suites (`tests/unit`, `tests/policy`, `tests/mcp`, `tests/sandbox`, `tests/e2e`), including a placeholder `tests/e2e` suite. Playwright is deferred until `apps/cockpit` has real UI to exercise.
- `tsx` to run TypeScript scripts directly (`harness/healthcheck.ts`, `harness/demo/*.ts`, `evals/runner.ts`) without a build step.
- ESLint flat config (`eslint.config.js`) with `typescript-eslint` recommended rules.
- Deterministic demo world as static JSON fixtures under `harness/demo/fixtures/`, seeded/reset/checked via `npm run demo:*`, matching the "SQLite or deterministic JSON fixtures" guidance in `.github/copilot-instructions.md`.
- `evals/*/cases.json` starts empty; `evals/runner.ts` treats an empty suite as a placeholder pass so `npm run eval:*` is runnable from the first commit and CI stays green during bootstrap.
- Docker Compose defines a single `app` service for local development; no database service is needed because the demo world is file-based.

## Consequences

- Fast, dependency-light bootstrap; no browsers or database containers are required to get `npm test` green.
- `test:e2e` and all `eval:*` scripts are placeholders with no real assertions yet — tracked as a known limitation until real agent/UI behavior exists.
- Follow-up ADRs will be needed when: Playwright replaces the `tests/e2e` placeholder, the policy/sandbox/MCP layers are implemented, and if/when the repository moves to npm workspaces for `apps/cockpit`.

## Security implications

No security-relevant runtime logic is introduced by this ADR. `.env.example` contains placeholder values only; the sandbox and demo world remain isolated from any real credentials.
