# SentinelOps

**An AI-native Security Operations copilot.**

SentinelOps ingests security alerts and telemetry, uses LLM agents backed by [MCP](https://modelcontextprotocol.io) tools to triage and investigate them, and proposes (or, with approval, executes) remediation actions inside a sandboxed environment — with every agent decision traceable and evaluable.

## Why

Security teams are drowning in alerts. Triage is repetitive, context-heavy, and time-critical — exactly the kind of work an LLM agent with the right tools and guardrails can accelerate, as long as it is transparent, auditable, and safely bounded.

## Key capabilities

- **Alert triage** — automatically enrich, correlate, and prioritize incoming security alerts.
- **Investigation** — agent-driven log/threat-intel queries via MCP tools to build an evidence trail.
- **Guarded remediation** — proposed response actions run through a policy engine and human-in-the-loop approval before executing in a sandbox.
- **Explainability** — every recommendation includes the evidence and reasoning trace behind it.
- **Evals** — a continuously growing eval suite scores agent accuracy, safety, and regression risk on every change.

## Integrations

**Purpose.** SentinelOps investigates through real, agent-callable MCP tools rather than a single monolithic backend — each external system (observability, deployments, source control, web search, chat, email, database) is a separately scoped MCP connector, wired to the TrueForge harness, so a specialist agent only ever sees the tools it is allowed to call.

**Scope — connectors by specialist:**

| Specialist                 | MCP connector                           | Tools                                                                         | Risk                                 |
| -------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| Observability investigator | `mcp/observability/`                    | error rates, latency, log search, trace query, Grafana PromQL range query     | read-only                            |
| Deployment investigator    | `mcp/deployments/`                      | list recent deployments, deployment diff, health, rollback-prerequisite check | read-only                            |
| Deployment investigator    | `mcp/context/` (2nd connector)          | GitHub PR lookup, Bitbucket PR lookup, bounded web search                     | read-only                            |
| Runbook investigator       | `mcp/incidents/`                        | runbook lookup                                                                | read-only                            |
| Commander (rollback)       | harness-orchestrated, not MCP-reachable | `deployments.rollback`                                                        | mutating, approval-gated             |
| Harness session API (UI)   | `harness/server/http.ts` adapter routes | Postgres query, Slack post, Gmail send, integration status                    | read-only + mutating, approval-gated |

**Demo/live dual mode.** Every adapter (Postgres, Grafana, mail, GitHub, Bitbucket, Slack, web search) runs in a deterministic **demo mode** by default — no external service or credential required, safe to run offline, and reproducible across runs. Setting the relevant credential env var (see `.env.example`) switches an adapter to **live mode** against the real external API; nothing else changes at the call site. Every context-tool response carries an explicit `provenance.mode: "demo" | "live"` field so this is never ambiguous to the agent, the audit trail, or the UI. GitHub, Bitbucket, and web search have no meaningful self-hosted equivalent and remain real-SaaS-or-demo; Postgres, Grafana, and mail additionally support a local "live stack" (see below) for a fully local live-mode demo.

**Security implications.** Read-only tools are gated purely by each specialist's MCP connector allowlist (a specialist literally cannot see a tool outside its list). Mutating tools (`slack.postMessage`, `mail.send`, `deployments.rollback`) additionally require an explicit, argument-bound human approval from `policy/gateway.ts`'s `authorize()` before executing — see [THREAT_MODEL.md](THREAT_MODEL.md) and [SECURITY.md](SECURITY.md). A missing or invalid approval fails closed with a typed `ApprovalRequiredError`, never a silent no-op or a fabricated success.

**Failure behavior.** Every adapter and tool returns a typed error (`BackendUnavailableError`, `InvalidArgumentsError`, `ApprovalRequiredError`, etc.) rather than partial or fabricated data; see `mcp/README.md` per-domain sections for the full list.

**Test/eval coverage.** `tests/mcp/adapters.test.ts` and `tests/mcp/context.test.ts` cover demo-mode determinism for every adapter and context tool; `tests/mcp/adapters-http.test.ts` covers the harness HTTP routes, including that the mutating Slack/mail routes fail closed with `ApprovalRequiredError` (not silently succeed) without an approval; `tests/policy/risk.test.ts` covers the tool-risk registry. The cockpit's Harness tab (`apps/cockpit/src/components/AdaptersPanel.tsx`, dev-only) exposes a "Run all (demo)" button that exercises every read-only integration in one pass, plus a live integration-status grid (`GET /api/adapters/status`) showing demo/live mode per integration at a glance.

**Known limitations.** This is a local demo, not a production deployment: there is no HTTP-level auth on the MCP servers or the harness session API, the approval store is a single unlocked local JSON file, and mutating tools other than `deployments.rollback` (`slack.postMessage`, `mail.send`) are reachable only through the harness session API today, not yet from within an agent's own tool-call loop. See `mcp/README.md` and `policy/README.md` for details.

## Documentation

| Doc                                              | Purpose                                              |
| ------------------------------------------------ | ---------------------------------------------------- |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md)               | Problem statement, personas, scope, success criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md)               | System components and data flow                      |
| [THREAT_MODEL.md](THREAT_MODEL.md)               | Threats to/from the agent and mitigations            |
| [SECURITY.md](SECURITY.md)                       | Vulnerability disclosure policy                      |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phased delivery plan                                 |
| [DECISIONS.md](DECISIONS.md)                     | Running log of key technical decisions               |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md)                 | Step-by-step demo walkthrough                        |
| [EVALS.md](EVALS.md)                             | Evaluation strategy and metrics                      |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | How to contribute                                    |
| [AGENTS.md](AGENTS.md)                           | Guidance for AI coding agents working in this repo   |

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.example .env   # local-only placeholders; never commit real secrets
npm run health          # verify the local toolchain and demo fixtures
npm run demo:seed       # seed the deterministic demo world into .demo-state/
npm run demo:check      # verify the demo world was seeded correctly
npm run demo:reset      # remove the seeded demo world
```

Or via Docker Compose:

```bash
docker compose up --build
```

### Local live stack (optional)

By default every MCP adapter (Postgres, Grafana, mail, GitHub, Bitbucket, Slack, web search) runs in deterministic demo mode — no external services required. To exercise the same adapters against real local backends instead of fixtures:

```bash
npm run live:up         # starts local postgres, prometheus, grafana, mailpit containers (docker compose --profile live)
npm run live:bootstrap  # waits for Grafana, creates a service-account token, writes GRAFANA_URL/GRAFANA_API_TOKEN/GRAFANA_DATASOURCE_UID into .env
```

Then set `POSTGRES_URL` and `SMTP_HOST` in `.env` (see the commented examples in `.env.example`) and restart `npm run session:server` to pick up the new values. Mailpit's web UI (sent-mail viewer) is at http://localhost:8025; Grafana's UI is at http://localhost:3001 (admin/admin, local-only).

GitHub, Bitbucket, Slack, and web search have no meaningful self-hosted equivalent and remain real-SaaS-or-demo — provide real tokens in `.env` to call them live, or leave blank for demo mode.

The generated-code sandbox (`sandbox/`) never talks to any of these services; it stays network-isolated regardless of live/demo mode (see `sandbox/README.md`).

Tear down with:

```bash
npm run live:down
```

The incident cockpit ([apps/cockpit](apps/cockpit)) is a self-contained npm package with its own tooling:

```bash
npm run cockpit:install
npm run cockpit:dev       # http://localhost:5173
```

### Validation commands

```bash
npm run lint
npm run typecheck
npm test              # unit + policy + mcp + sandbox suites
npm run test:policy
npm run test:mcp
npm run test:sandbox
npm run test:e2e
npm run eval:smoke
npm run eval:core
npm run eval:adversarial
npm run eval:replay

# apps/cockpit has its own lint/typecheck/test/e2e suite
npm run cockpit:lint
npm run cockpit:typecheck
npm run cockpit:test
npm run cockpit:build && npm run cockpit:test:e2e
```

This is a local demo/hackathon build, not a production deployment: agent behavior, MCP tools (including the integrations above), sandboxed diagnostics, the approval-gated policy layer, and the incident cockpit UI are all implemented and tested — see each directory's `README.md` for the current scope and known limitations of that layer.

## Status

Early-stage — see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for current milestone and [DECISIONS.md](DECISIONS.md) for the latest architectural decisions.

## License

TBD.
