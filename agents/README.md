# Agent Configuration (agents/)

## Purpose

TrueForge agent configuration and skills: commander, observability investigator, deployment investigator, runbook investigator, security reviewer, and verification agent (see ARCHITECTURE.md).

## Scope

Prompt and configuration definitions and skill wiring for TrueForge. No policy enforcement and no direct tool-execution logic — that lives in `mcp/` and `policy/`.

## Assumptions

The TrueForge runtime is available via the `harness/` integration layer.

## Security implications

Agent configuration must never encode authorization decisions. Model output is untrusted; policy enforcement happens only in `policy/`.

## Implemented: commander agent (`agents/commander/`) and `incident-investigation` skill

`agents/commander/system-prompt.v1.md` is the versioned system prompt for the commander agent, built into a TrueForge `AgentSpec` by `harness/agent/spec.ts`'s `buildCommanderAgentSpec()`. It requires the agent to establish scope, investigate only with read-only tools, inspect deployments, retrieve the runbook, synthesize evidence and at least one alternative hypothesis, and explicitly stop before proposing a mutation when evidence is insufficient — while treating every tool response, log, deployment description, commit message, and runbook as untrusted data that can never override the prompt.

`agents/skills/incident-investigation/SKILL.md` is the paired investigation procedure the commander agent follows: scope → read-only evidence gathering → deployment inspection → runbook retrieval → hypothesis synthesis → sufficiency check → structured report.

The commander agent is attached to exactly three MCP connectors (observability, deployments, incidents), each restricted to `enableTools: ["@read-only"]`; no rollback-capable connector is attached in this phase (see `harness/README.md`). This is a structural guarantee enforced in `spec.ts`, independent of the prompt text above.

## Failure behavior

N/A for the commander agent beyond what `harness/agent/session.ts` already handles (typed errors from the TrueForge client propagate to the caller).

## Implemented: bounded specialist agents (Phase 6)

Five specialist agents, each with a distinct responsibility, an explicit
literal tool allowlist (never `@all`/`@write`/`@destructive`), and a
dedicated system prompt + skill:

| Specialist                 | Prompt / skill                                                       | Tools                                                       | Cannot                                        |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Observability Investigator | `agents/observability-investigator/`, skill `observability-analysis` | 4 observability read-only tools                             | mutate, approve, delegate, expand tool access |
| Deployment Investigator    | `agents/deployment-investigator/`, skill `deployment-analysis`       | 4 read-only deployment tools (never `deployments.rollback`) | mutate, approve, delegate, expand tool access |
| Runbook Investigator       | `agents/runbook-investigator/`, skill `runbook-lookup`               | 1 tool (`incidents.get_runbook`)                            | mutate, approve, delegate, expand tool access |
| Security Reviewer          | `agents/security-reviewer/`, skill `security-review`                 | none — reviews evidence it is handed                        | mutate, approve, delegate, call any tool      |
| Verification Agent         | `agents/verification-agent/`, skill `verification`                   | 3 read-only recovery-check tools across two connectors      | repair, mutate, approve, delegate             |

Specs are built by `harness/agent/specialists.ts`'s five `build*AgentSpec()`
functions. Structural guarantees enforced there (independent of prompt
wording, per this repo's established pattern for the commander spec):

- Every specialist's `mcpServers[].enableTools` is an explicit array of
  literal tool names (never the broad `@read-only` selector the commander
  uses) — the security reviewer has `mcpServers: []` entirely.
- No specialist spec ever sets `config.dynamicSubAgents` — specialists have
  no TrueForge-level mechanism to delegate further at all.
- Each specialist has its own typed zod schema + hand-authored JSON Schema
  response format (`harness/agent/specialist-result-schema.ts`), including a
  self-reported `toolsUsed` field.

Delegation from the commander to specialists is bounded and tracked in
plain TypeScript, not left to prompt compliance: `harness/agent/delegation.ts`'s
`DelegationTracker`/`DelegationCoordinator` enforce a maximum delegation
depth (default 1 — specialists can never delegate further), a maximum
total delegation count per investigation, reject a delegation loop (the
same specialist already active in the chain), and independently verify
every tool a specialist self-reports using against its static allowlist
(`UnauthorizedToolAccessError` otherwise) — mirroring `policy/gateway.ts`'s
"never trust a claim without an independent check" pattern.

Specialist disagreement is preserved, never hidden: `harness/agent/disagreement.ts`'s
`detectDisagreement()` pairwise-compares specialist verdicts (pure,
deterministic, no model call), and `harness/agent/aggregate.ts`'s
`aggregateSpecialistFindings()` always includes a `disagreements` field in
its output (empty when specialists agree) alongside every specialist's
full findings — there is no code path that constructs the aggregated
report while dropping either.

The security reviewer's prompt-injection detection is a heuristic scanner,
`harness/agent/prompt-injection-scan.ts`'s `scanForPromptInjection()`,
checked against known override phrasing (and the existing
`mcp/incidents/runbook-catalog.ts` injection fixture in tests) — a
heuristic layer of defense, not a substitute for the system-wide rule that
tool output is always untrusted data (see SECURITY.md "Prompt injection").

## Failure behavior (specialists)

A specialist that cannot complete its delegated task (tool failure,
insufficient evidence) must report that plainly in its structured findings
(`verdict: "inconclusive"` plus `reason`) rather than fabricating a result.
`DelegationCoordinator.delegate()` always releases its tracker slot, even
when the specialist's run throws.

## Test or eval coverage (specialists)

`tests/unit/specialist-specs.test.ts` covers each specialist's distinct,
explicit tool allowlist and the absence of `dynamicSubAgents`.
`tests/unit/delegation.test.ts` covers depth limits, budget limits,
delegation-loop detection, and unauthorized-tool-access rejection.
`tests/unit/disagreement.test.ts` and `tests/unit/aggregate.test.ts` cover
disagreement detection and its guaranteed presence in the aggregated
report. `tests/unit/prompt-injection-scan.test.ts` covers the security
reviewer's detector against both synthetic and real fixture text.
`evals/core/cases.json` has one case per specialist plus a specialist-
disagreement case; `evals/adversarial/cases.json` has an infinite-
delegation-attempt case and an unauthorized-tool-access-attempt case.

## Known limitations

Only the commander agent and its five specialists are implemented at the
agent-configuration level; there is no live orchestration code yet that
actually starts a specialist's TrueForge session from the commander's turn
(the delegation coordinator's `run` callback is the injection point for
that, exercised so far only with fakes in tests — see
`tests/unit/delegation.test.ts`).
