#!/usr/bin/env -S npx tsx
// Minimal local health check for the SentinelOps skeleton. Fails loudly (non-zero exit)
// instead of silently, per AGENTS.md "no silent failure" invariant.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface HealthCheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

function checkNodeVersion(): HealthCheckResult {
  const [major] = process.versions.node.split(".").map(Number);
  const ok = typeof major === "number" && major >= 20;
  return { name: "node-version", ok, detail: process.versions.node };
}

function checkEnvExamplePresent(): HealthCheckResult {
  const path = resolve(process.cwd(), ".env.example");
  return { name: "env-example-present", ok: existsSync(path) };
}

function checkDemoFixturesPresent(): HealthCheckResult {
  const path = resolve(process.cwd(), "harness/demo/fixtures/world.json");
  return { name: "demo-fixtures-present", ok: existsSync(path) };
}

function main(): void {
  const results: readonly HealthCheckResult[] = [
    checkNodeVersion(),
    checkEnvExamplePresent(),
    checkDemoFixturesPresent(),
  ];
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    const status = result.ok ? "OK" : "FAIL";
    const detail = result.detail ? ` (${result.detail})` : "";
    console.log(`[${status}] ${result.name}${detail}`);
  }

  if (failed.length > 0) {
    console.error(
      `Health check failed: ${failed.length} check(s) did not pass.`,
    );
    process.exit(1);
  }

  console.log("Health check passed.");
}

main();
