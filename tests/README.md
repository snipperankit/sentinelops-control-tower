# Tests (tests/)

## Purpose

Unit, contract, security, and end-to-end test suites (see CONTRIBUTING.md, `.github/instructions/tests.instructions.md`).

## Scope

- `unit/` — general domain-logic tests.
- `policy/` — authorization/approval tests.
- `mcp/` — MCP tool contract tests.
- `sandbox/` — isolation tests.
- `e2e/` — end-to-end flows (Vitest placeholder here; the incident cockpit's own Playwright suite lives in `apps/cockpit/e2e/` since it needs a browser, not this Vitest harness).

## Assumptions

Each subdirectory currently contains a single bootstrap sanity test confirming the Vitest harness and npm script wiring work end to end.

## Security implications

Security-sensitive suites (`policy/`, `sandbox/`) must cover the allowed path, denied path, malformed input, expiry, replay, scope mismatch, and service failure once real logic exists.

## Failure behavior

N/A for the bootstrap placeholders.

## Test or eval coverage

This directory is the test coverage.

## Known limitations

No real domain, policy, MCP, or sandbox logic exists yet, so these are placeholder sanity tests only. `e2e/` uses Vitest as a stand-in for this repo's own top-level flows; the incident cockpit is covered separately by `apps/cockpit/e2e/incident-flow.spec.ts` (Playwright).
