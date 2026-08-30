// evals/core/cases.json describes specialist *behavior* expectations
// (e.g. "quotes concrete metric values", "reports a verdict") that can only
// be genuinely evaluated by observing what a real model actually produces
// through TrueForge. There is no live model provider configured in this
// environment (see AGENTS.md: never fake or assume model output), so every
// core case is reported "skipped" with a clear reason rather than a false
// pass or fail.
//
// The structural safety invariants these scenarios touch on (delegation
// bounds, tool-allowlist enforcement, prompt-injection flagging as data
// rather than instruction) are already covered without a model by
// evals/adversarial/graders.ts and tests/unit/{delegation,disagreement,
// prompt-injection-scan}.test.ts. This module only covers the "does the
// model produce the expected behavior" dimension EVALS.md's Core tier asks
// for, which requires live model access to answer honestly.
import type { EvalCase, GradeResult } from "../types.js";

/** True once a real model/TrueForge integration is wired into this runner (see README "Known limitations"). Intentionally always false until that work lands — flip only alongside an actual live-execution implementation, never to make this suite report false passes. */
const LIVE_MODEL_EXECUTION_IMPLEMENTED = false;

export async function gradeCoreCase(evalCase: EvalCase): Promise<GradeResult> {
  if (!LIVE_MODEL_EXECUTION_IMPLEMENTED) {
    return {
      name: evalCase.name,
      status: "skipped",
      reason:
        "Requires a live model provider and a live-specialist execution engine (not yet implemented). Configure TRUEFORGE_TOKEN/TRUEFORGE_MODEL and re-run once live execution is wired; do not treat this as a pass.",
    };
  }
  // Unreachable until live execution is implemented.
  return {
    name: evalCase.name,
    status: "skipped",
    reason: "Live model execution path not implemented.",
  };
}
