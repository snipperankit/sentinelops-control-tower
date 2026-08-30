// Verifies the demo world has been seeded and its structural invariants hold.
// Fails loudly (non-zero exit) rather than assuming an unseeded state is fine.
import { checkWorldHealth } from "./health.js";
import { DemoWorldStore } from "./store.js";

function main(): void {
  const store = new DemoWorldStore();
  const results = checkWorldHealth(store);
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    const status = result.ok ? "OK" : "FAIL";
    const detail = result.detail ? ` (${result.detail})` : "";
    console.log(`[${status}] ${result.name}${detail}`);
  }

  if (failed.length > 0) {
    console.error(
      `Demo world check failed: ${failed.length} check(s) did not pass.`,
    );
    process.exit(1);
  }

  console.log("Demo world check passed.");
}

main();
