# Implementation Plan

This plan breaks delivery of the MVP described in [PRODUCT_SPEC.md](PRODUCT_SPEC.md) into incremental milestones. Update this file as milestones complete or scope changes, and log significant decisions in [DECISIONS.md](DECISIONS.md).

## Milestone 0 — Foundations

- Repository scaffolding, docs, agent/instruction/prompt customizations (this milestone).
- Define incident/event schema shared across ingestion, agents, and dashboard.
- Stand up eval harness skeleton with trace storage under [docs/traces/](docs/traces/).

## Milestone 1 — Ingestion & Triage

- Ingestion Service accepting at least one alert source format.
- Triage Agent producing severity/priority + rationale.
- First MCP tool server: log/SIEM query.
- Minimal dashboard: incident list + triage output.
- First eval set covering triage accuracy (see [EVALS.md](EVALS.md)).

## Milestone 2 — Investigation

- Investigation Agent with multi-tool evidence gathering (log query + threat intel).
- Reasoning/evidence trace surfaced in the dashboard.
- Expand eval set to cover investigation quality (evidence relevance, completeness).

## Milestone 3 — Guarded Remediation

- Remediation Agent proposing actions from a fixed allow-list.
- Policy Engine with risk classification and mandatory human-approval gate.
- Sandbox Executor for actually performing approved actions against a test/staging target.
- Threat-model review of the full remediation path (see [THREAT_MODEL.md](THREAT_MODEL.md)) before enabling against any real system.

## Milestone 4 — Hardening & Demo Readiness

- Full audit logging and traceability across ingestion → triage → investigation → remediation.
- Security review pass (`security` agent) against [THREAT_MODEL.md](THREAT_MODEL.md).
- Eval suite covering regression cases and adversarial/prompt-injection scenarios.
- Rehearsed demo per [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

## Tracking

Detailed task breakdowns live in the issue tracker; this file tracks milestone-level status only. Update the table below as work progresses.

| Milestone                | Status      |
| ------------------------ | ----------- |
| M0 — Foundations         | In progress |
| M1 — Ingestion & Triage  | Not started |
| M2 — Investigation       | Not started |
| M3 — Guarded Remediation | Not started |
| M4 — Hardening & Demo    | Not started |

## Related documents

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md), [EVALS.md](EVALS.md)
