# Demo Script

A rehearsed walkthrough for demonstrating SentinelOps end to end. Update this as capabilities land per [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); keep it runnable at all times against `main`.

## Pre-demo setup

- [ ] Environment seeded with sample alerts / synthetic incidents (see [docs/traces/](docs/traces/) for reference traces).
- [ ] Dashboard running and reachable.
- [ ] MCP tool servers (log query, threat intel, remediation) up and pointed at demo/staging targets — never production.
- [ ] Confirm policy engine is in "approval required" mode for the demo.

## Script

### 1. The problem (1 min)

Show the raw incoming alert queue — volume and lack of context — to set up the "why."

### 2. Triage in action (2 min)

Trigger/point to a new alert. Show the Triage Agent's severity score and rationale appearing in the dashboard within seconds.

### 3. Investigation (2 min)

Open the incident detail view. Walk through the Investigation Agent's evidence trail: which MCP tools were called, what evidence was found, and how it supports the conclusion.

### 4. Guarded remediation (3 min)

Show the Remediation Agent's proposed action (e.g., "isolate host X"). Highlight:

- The policy engine flags it as high-impact.
- It waits at the human-approval gate rather than executing automatically.
- Approving it triggers the Sandbox Executor, and the dashboard reflects the outcome.

### 5. Auditability (1 min)

Show the full trace for the incident — from alert ingestion to approved action — proving nothing happened outside the recorded evidence chain.

### 6. Evals (1 min, optional)

Show a recent eval run (see [EVALS.md](EVALS.md)) demonstrating measured accuracy on triage/investigation quality.

## Fallback plan

If live services are unavailable, replay a captured trace from [docs/traces/](docs/traces/) through the dashboard in "replay mode" instead of live ingestion.

## Related documents

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [EVALS.md](EVALS.md)
