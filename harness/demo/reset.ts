// Resets the deterministic demo world back to an unseeded state.
import { DemoWorldStore } from "./store.js";

function main(): void {
  const store = new DemoWorldStore();
  const wasSeeded = store.isSeeded();
  store.reset();
  console.log(
    wasSeeded
      ? "Demo world reset."
      : "Demo world already clean: nothing to reset.",
  );
}

main();
