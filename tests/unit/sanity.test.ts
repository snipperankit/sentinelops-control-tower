import { describe, expect, it } from "vitest";

describe("bootstrap sanity", () => {
  it("runs the unit test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
