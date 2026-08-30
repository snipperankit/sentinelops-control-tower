# SentinelOps Product Specification

## Product

SentinelOps Control Tower

## Tagline

Investigate autonomously. Change nothing blindly.

## User

An SRE, incident commander, or platform engineer responding to a service incident.

## Primary use case

Investigate a payment-failures alert and recommend a rollback if a deployment caused the regression.

## User story

As an incident responder, I want an agent to correlate operational evidence and prepare a safe remediation so that I spend less time navigating tools while retaining control over high-impact changes.

## Demo scenario

Deployment `4c21` introduces a faulty checkout timeout configuration.

Expected symptoms:

- Payment failures increase from 2.1% to 6.8%.
- Checkout p95 latency increases from 840 ms to 1,750 ms.
- Regression begins four minutes after deployment.
- Unrelated services remain comparatively stable.
- Deployment `4c20` is the last known healthy version.

## Functional requirements

### Investigation

- Accept an incident request.
- Establish service and time-window scope.
- Query error rates.
- Query latency.
- Search logs.
- List recent deployments.
- Inspect deployment diffs.
- Retrieve rollback runbook.
- Compare alternative hypotheses.

### Multi-agent analysis

- Commander coordinates the session.
- Observability investigator analyzes metrics and logs.
- Deployment investigator analyzes recent changes.
- Runbook investigator identifies prerequisites and verification.
- Security reviewer checks evidence trust and action safety.
- Verification agent validates recovery after mutation.

### Sandbox

- Run generated diagnostic code.
- Disable network access by default.
- Provide no secrets.
- Use a temporary workspace.
- Limit CPU, memory, and execution time.
- Return structured artifacts.

### Approval

- Display exact tool and arguments.
- Display evidence and confidence.
- Display blast radius and risk.
- Display verification plan.
- Expire approvals.
- Prevent replay.
- Reject changed arguments.
- Deny if policy service is unavailable.

### Verification

- Query payment failure rate.
- Query checkout latency.
- Query deployment health.
- Check request volume.
- Check dependency health.
- Report residual risk.

### Audit

Record:

- Session ID.
- Agent configuration version.
- Model identifier.
- Tool calls.
- Tool results or hashes.
- Sandbox executions.
- Approval requests.
- Approval decisions.
- Mutating actions.
- Verification results.
- Final status.

## Non-functional requirements

- Reproducible local demo.
- No external production dependency.
- No secrets in repository.
- Fail closed for consequential actions.
- Strong runtime validation.
- Structured errors.
- Clear UI state transitions.
- Replayable evaluations.
- Pull-request-based development.

## Out of scope

- Real production credentials.
- Real cloud rollback.
- Autonomous production remediation.
- Full Kubernetes orchestration.
- Generic chat assistant features.
- Multiple unrelated domains.
- Long-term memory beyond the incident session.

## Success metrics

- Time from alert to evidence-backed recommendation.
- Root-cause accuracy.
- Correct tool trajectory.
- Approval compliance.
- Verification completion rate.
- Number of unsafe mutations.
- Number of sandbox escapes.
- Median tool calls.
- Human approval decision time.
- Eval regression rate.
