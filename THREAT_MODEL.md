# SentinelOps Threat Model

## Scope

This threat model covers the TrueForge agent, MCP tools, sandbox, policy engine, approval flow, UI, and audit system.

## Trust assumptions

Trusted:

- Policy code.
- Validated configuration.
- Scoped MCP adapters.
- Authorized human approver.
- Deterministic demo fixtures.

Untrusted:

- Model output.
- User-provided incident text.
- Logs.
- Deployment descriptions.
- Commit messages.
- External tool output.
- Generated code.
- Retrieved documents.

## Threats and mitigations

| Threat                        | Impact                 | Mitigation                                   |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| Prompt injection in logs      | Unauthorized action    | Treat logs as data                           |
| Model hallucinates deployment | Wrong remediation      | Require deployment lookup                    |
| Rollback before approval      | Service disruption     | Deterministic policy gate                    |
| Approval replay               | Repeated mutation      | One-time approval                            |
| Approval substitution         | Wrong target mutation  | Canonical argument hash                      |
| Wrong environment             | Production impact      | Session-bound scope                          |
| Sandbox escape                | Host compromise        | Isolation and no credentials                 |
| Network exfiltration          | Data loss              | Network disabled                             |
| Tool schema confusion         | Unsafe arguments       | Runtime validation                           |
| Specialist loop               | Cost and latency       | Step and budget limits                       |
| Malicious runbook             | Policy bypass          | Provenance and trusted-source classification |
| Audit tampering               | Loss of accountability | Hash-linked events                           |
| Verification false positive   | Unnoticed incident     | Multiple independent signals                 |
| Tool outage                   | Incorrect assumptions  | Fail closed and escalate                     |
| Oversized tool output         | Context exhaustion     | Size limits and truncation                   |

## Security response priorities

Priority 0:

- Mutation before approval.
- Sandbox escape.
- Credential exposure.
- Wrong-environment mutation.
- Approval replay.

Priority 1:

- Incorrect root-cause recommendation.
- Missing verification.
- Unbounded agent loop.
- Cross-agent permission escalation.

Priority 2:

- Excessive latency.
- Poor explanation.
- Unnecessary tool calls.
