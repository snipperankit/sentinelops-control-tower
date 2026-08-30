// Request/result schemas and types for the sandbox runner (see
// .github/instructions/sandbox.instructions.md). Kept separate from
// docker-runner.ts / runner.ts so the shape of a sandbox execution is
// reviewable independent of how it is enforced.
import { z } from "zod";
import { InvalidExecutionRequestError } from "./errors.js";

/** Hard ceiling on generated code size — this is diagnostics, not a general-purpose script host. */
const MAX_CODE_LENGTH = 20_000;
/** Hard ceiling on how many approved input fixtures a single execution may request. */
const MAX_INPUT_FIXTURES = 10;

export const resourceLimitsSchema = z.object({
  /** Fractional CPUs made available to the container (docker --cpus). */
  cpus: z.number().positive().max(2).default(1),
  /** Memory ceiling in megabytes (docker --memory / --memory-swap, swap disabled). */
  memoryMb: z.number().int().positive().max(512).default(128),
  /** Wall-clock execution budget in milliseconds, enforced by the runner via `docker kill`. */
  timeoutMs: z.number().int().positive().max(30_000).default(5_000),
  /** Maximum live process count inside the container (docker --pids-limit). */
  pidsLimit: z.number().int().positive().max(64).default(16),
  /** Maximum combined bytes captured from stdout or stderr before the run is terminated and the stream flagged as truncated. */
  maxOutputBytes: z.number().int().positive().max(1_000_000).default(65_536),
});

export type ResourceLimits = z.infer<typeof resourceLimitsSchema>;

export const executionRequestSchema = z.object({
  /** Generated JavaScript, executed with `node` inside the sandbox container. Untrusted — see SECURITY.md prompt-injection section. */
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  /**
   * Basenames of approved fixtures (see fixtures.ts) to copy read-only into
   * the workspace's `fixtures/` directory before execution. Never a host
   * path — resolved strictly against an allowlisted root.
   */
  inputFixtures: z.array(z.string()).max(MAX_INPUT_FIXTURES).default([]),
  // Every field of resourceLimitsSchema has its own `.default()`, so a
  // missing key here (or an entirely omitted `limits` object) still
  // resolves to a fully-populated ResourceLimits — no separate merge step
  // is needed downstream.
  limits: resourceLimitsSchema.default({}),
});

export type ExecutionRequestInput = z.input<typeof executionRequestSchema>;
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

/**
 * Parses and validates a raw execution request, throwing
 * `InvalidExecutionRequestError` on failure rather than letting an
 * ill-formed request reach the workspace/docker layers.
 */
export function parseExecutionRequest(raw: unknown): ExecutionRequest {
  const parsed = executionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidExecutionRequestError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }
  return parsed.data;
}

export type SandboxExecutionStatus =
  | "completed"
  | "failed"
  | "timed_out"
  | "resource_limit_exceeded"
  | "sandbox_unavailable";

export type ResourceLimitViolation =
  | "cpu_time"
  | "memory"
  | "execution_time"
  | "process_count"
  | "output_size";

export interface SandboxArtifactReference {
  readonly name: string;
  readonly sizeBytes: number;
}

export interface SandboxExecutionResult {
  readonly status: SandboxExecutionStatus;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly artifacts: readonly SandboxArtifactReference[];
  readonly resourceLimitViolations: readonly ResourceLimitViolation[];
}
