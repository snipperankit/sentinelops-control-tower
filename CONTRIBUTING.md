# Contributing

## Branch policy

Do not commit directly to `main`.

Use:

```text
feat/<short-name>
fix/<short-name>
test/<short-name>
docs/<short-name>
```

## Pull requests

Every pull request must include:

- Problem statement.
- Scope.
- Design summary.
- Security impact.
- Tests added or updated.
- Eval impact.
- Documentation updates.
- Known limitations.

## Qodo process

Qodo must review every meaningful pull request.

For each finding:

- Fix valid findings.
- Add a regression test where appropriate.
- Explain disagreements in the pull request.
- Do not delete review history.

## Commit style

Use focused commits:

```text
feat(policy): bind approvals to canonical arguments
test(policy): reject changed rollback target
docs(security): document approval replay threat
fix(sandbox): disable network access by default
```

## Test requirements

New policy code requires policy tests.

New MCP tools require contract tests.

New sandbox behavior requires isolation tests.

New agent behavior requires eval cases.

New UI approval behavior requires a component or end-to-end test.

## Required commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:policy
npm run test:sandbox
npm run eval:smoke
```

## Security review checklist

- Does this add a tool?
- Does it expose new data?
- Does it change authorization?
- Does it change the sandbox?
- Does it change the approval payload?
- Does it affect audit logging?
- Does it introduce a new prompt or external document?

If yes, update `SECURITY.md`, `THREAT_MODEL.md`, or an ADR.
