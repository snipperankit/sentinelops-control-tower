# Sandbox (sandbox/)

## Purpose

Restricted execution environment for generated diagnostic code (see SECURITY.md, THREAT_MODEL.md, `.github/instructions/sandbox.instructions.md`).

## Scope

Non-root, network-disabled, credential-free, temporary-workspace execution of generated code only. Never used for operational mutation.

## Implementation

- `contract.ts` — request/result schemas (`resourceLimitsSchema`, `executionRequestSchema`) and the `SandboxExecutionResult` shape. All resource limits are bounded (`cpus` ≤ 2, `memoryMb` ≤ 512, `timeoutMs` ≤ 30s, `pidsLimit` ≤ 64, `maxOutputBytes` ≤ 1MB) with safe defaults.
- `fixtures.ts` — resolves approved input fixture names strictly against `sandbox/fixtures/`, rejecting traversal (`..`), absolute paths, and embedded separators. Deliberately separate from `harness/demo/fixtures/` (the mutable demo-world state) — the sandbox has no path to that directory at all.
- `workspace.ts` — creates a single-use temporary host directory (`prepareWorkspace`) containing only the generated code and explicitly approved fixtures, and always destroys it (`destroy()`), including on partial failure.
- `docker-runner.ts` — the only module that shells out to `docker`. `buildDockerRunArgs` is a pure function (no side effects) so isolation flags can be reviewed and unit-tested as plain data: `--network none`, fixed non-root `--user`, `--read-only` root filesystem with a `noexec,nosuid` tmpfs `/tmp`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit`/`--cpus`/`--memory`/`--memory-swap`, and only two fixed `--env` values (`NODE_ENV=sandbox`, `HOME=/tmp`) — no host environment variables are forwarded. Exactly one host mount is ever passed: the caller's temporary workspace.
- `runner.ts` — public `runSandboxExecution()` entrypoint. Fails closed to a `sandbox_unavailable` result if the Docker daemon is unreachable (never falls back to running generated code directly on the host). Always destroys the workspace in a `finally` block.

## Assumptions

Docker Engine is reachable from the host running SentinelOps. If it is not, `runSandboxExecution` returns `status: "sandbox_unavailable"` rather than executing generated code unsandboxed.

## Security implications

Must never mount the host Docker socket or filesystem, and must never receive production credentials or network access. All of these are enforced structurally in `buildDockerRunArgs` and covered by tests (see below) rather than relying on generated code behaving.

## Failure behavior

Resource-limit violations are returned as structured results (`SandboxExecutionResult.status` plus `resourceLimitViolations`), never silently dropped. Known gap: `process_count` (pids-limit) violations are not currently distinguishable from an ordinary non-zero exit in `docker inspect` output, so a fork-bomb attempt will be killed by the kernel but may surface as `status: "failed"` rather than a specific `resource_limit_exceeded` violation. The container is still terminated and cannot escape its limits.

## Test or eval coverage

`tests/sandbox/` covers:

- `docker-args.test.ts` — static assertions on `buildDockerRunArgs()` (no Docker required): no Docker-socket mount, `--network none`, non-root user, single workspace mount only, capability drop, read-only root, fixed env allowlist, resource-limit flags.
- `fixtures.test.ts` — path-traversal defense on `resolveApprovedFixturePath()` (no Docker required): rejects `..`, absolute paths, and embedded separators.
- `workspace.test.ts` — temporary workspace lifecycle: creation, fixture copying, and guaranteed destruction, including on invalid input.
- `isolation.test.ts` — end-to-end adversarial scenarios executed in real Docker containers via `runSandboxExecution()`, each demonstrating blocking or safe termination: environment-variable access, network access, path traversal, host-file access, infinite execution (timeout), excessive output (truncation + kill), Docker socket access, and direct demo-world-state mutation. Also asserts no orphaned temporary workspace directories remain after execution.

These tests require a reachable Docker daemon; they were validated against Docker Desktop / Docker Engine locally. They must never be weakened (e.g. by mocking Docker or relaxing isolation flags) to force a pass.

## Known limitations

- `process_count` resource-limit violations are not independently reported (see Failure behavior above).
- Live isolation tests depend on Docker being installed and reachable in the environment running the test suite; there is currently no explicit skip guard for a Docker-unavailable CI environment. If Docker is unavailable, `npm test` will fail these tests rather than silently skip them (intentional: silent skipping could mask a real isolation regression going undetected).
