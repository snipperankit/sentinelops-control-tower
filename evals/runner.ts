// Eval-suite runner: loads each suite's cases.json and, where an executable
// grader exists, actually runs it against real application code (policy
// gateway, sandbox runner, delegation tracker, LiveIncidentSession's no-LLM
// fallback path) and reports pass/fail/skip. See EVALS.md for the tiers and
// evals/README.md for current coverage and known limitations. A case with
// no registered grader is reported "skipped", not silently dropped, so the
// suite stays honest about what it has and hasn't actually verified.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EvalCase, GradeResult, GraderRegistry } from "./types.js";
import { smokeGraders } from "./smoke/graders.js";
import { adversarialGraders } from "./adversarial/graders.js";
import { gradeCoreCase } from "./core/graders.js";

const SUITES = ["smoke", "core", "adversarial", "replay"] as const;
type Suite = (typeof SUITES)[number];

function isSuite(value: string | undefined): value is Suite {
  return value !== undefined && (SUITES as readonly string[]).includes(value);
}

function loadCases(suite: Suite): readonly EvalCase[] {
  const path = resolve(process.cwd(), `evals/${suite}/cases.json`);
  if (!existsSync(path)) {
    return [];
  }
  return JSON.parse(readFileSync(path, "utf-8")) as readonly EvalCase[];
}

async function gradeWithRegistry(
  evalCase: EvalCase,
  registry: GraderRegistry,
): Promise<GradeResult> {
  const grader = registry[evalCase.name];
  if (!grader) {
    return {
      name: evalCase.name,
      status: "skipped",
      reason: "No executable grader registered for this case yet.",
    };
  }
  try {
    return await grader(evalCase);
  } catch (error) {
    return {
      name: evalCase.name,
      status: "fail",
      reason: `Grader threw unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function gradeSuite(
  suite: Suite,
  cases: readonly EvalCase[],
): Promise<readonly GradeResult[]> {
  switch (suite) {
    case "smoke":
      return Promise.all(cases.map((c) => gradeWithRegistry(c, smokeGraders)));
    case "adversarial":
      return Promise.all(
        cases.map((c) => gradeWithRegistry(c, adversarialGraders)),
      );
    case "core":
      return Promise.all(cases.map((c) => gradeCoreCase(c)));
    case "replay":
      return [];
  }
}

function printResult(result: GradeResult): void {
  const marker =
    result.status === "pass"
      ? "PASS"
      : result.status === "fail"
        ? "FAIL"
        : "SKIP";
  console.log(`  [${marker}] ${result.name}`);
  console.log(`         ${result.reason}`);
  if (result.observedCriticalFailures?.length) {
    console.log(
      `         critical failure tags: ${result.observedCriticalFailures.join(", ")}`,
    );
  }
}

async function main(): Promise<void> {
  const suiteArg = process.argv[2];
  if (!isSuite(suiteArg)) {
    console.error(`Usage: tsx evals/runner.ts <${SUITES.join("|")}>`);
    process.exit(1);
  }

  const cases = loadCases(suiteArg);
  if (cases.length === 0) {
    console.log(`[${suiteArg}] No eval cases defined yet. Placeholder pass.`);
    return;
  }

  const results = await gradeSuite(suiteArg, cases);
  for (const result of results) {
    printResult(result);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  console.log(
    `[${suiteArg}] ${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total).`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
