import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest is configured without global test APIs, so Testing Library's
// automatic afterEach-based cleanup cannot self-register; do it explicitly
// to avoid components leaking between tests.
afterEach(() => {
  cleanup();
});
