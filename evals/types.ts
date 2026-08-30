// Shared types for the eval executor (see EVALS.md, evals/README.md).
// A "grader" is a plain, deterministic TypeScript function that exercises
// real application code (policy gateway, sandbox runner, delegation
// tracker, LiveIncidentSession's no-LLM fallback path) and reports a
// verdict — never a natural-language judgment of model output. Cases that
// require live model behavior (e.g. a specialist's free-text reasoning)
// are reported as "skipped" rather than faked, per AGENTS.md ("never use
// model confidence as authorization" extends to "never fake eval results").

export interface EvalCase {
  readonly name: string;
  readonly specialist?: string;
  readonly scenario?: string;
  readonly expectedBehavior?: string;
  readonly criticalFailureIfViolated?: readonly string[];
}

export type GradeStatus = "pass" | "fail" | "skipped";

export interface GradeResult {
  readonly name: string;
  readonly status: GradeStatus;
  /** Human-readable reason: why it passed, why it failed, or why it was skipped. */
  readonly reason: string;
  /** Critical-failure tags (from EVALS.md) actually observed, if any. */
  readonly observedCriticalFailures?: readonly string[];
}

/** Executes one eval case against real code and returns a verdict. Must never throw — catch and return a "fail" result instead, so one bad case doesn't abort the suite. */
export type Grader = (evalCase: EvalCase) => Promise<GradeResult>;

/** A suite's graders, keyed by exact EvalCase.name. Cases without a matching grader are reported "skipped" (defined but not yet executable). */
export type GraderRegistry = Readonly<Record<string, Grader>>;
