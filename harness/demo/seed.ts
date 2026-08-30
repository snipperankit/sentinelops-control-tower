// Seeds the deterministic demo world (deployments 4c18-4c21 + metrics) into
// a local, git-ignored working file (.demo-state/world.json).
import { DemoWorldStore } from "./store.js";

function main(): void {
  const store = new DemoWorldStore();
  try {
    const state = store.seed();
    console.log(
      `Demo world seeded: active deployment ${state.activeDeploymentId}, ` +
        `${state.deployments.length} deployments, ${state.metrics.length} metric points.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
