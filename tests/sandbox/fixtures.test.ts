import { describe, expect, it } from "vitest";
import { resolveApprovedFixturePath } from "../../sandbox/fixtures.js";
import { FixtureNotApprovedError } from "../../sandbox/errors.js";

describe("resolveApprovedFixturePath: path traversal", () => {
  it("resolves a plain approved fixture name", () => {
    expect(() =>
      resolveApprovedFixturePath("sample-metrics.json"),
    ).not.toThrow();
  });

  it("rejects parent-directory traversal", () => {
    expect(() => resolveApprovedFixturePath("../fixtures.ts")).toThrow(
      FixtureNotApprovedError,
    );
  });

  it("rejects deep parent-directory traversal toward host files", () => {
    expect(() => resolveApprovedFixturePath("../../../../etc/passwd")).toThrow(
      FixtureNotApprovedError,
    );
  });

  it("rejects absolute host paths", () => {
    expect(() => resolveApprovedFixturePath("/etc/passwd")).toThrow(
      FixtureNotApprovedError,
    );
  });

  it("rejects embedded path separators", () => {
    expect(() => resolveApprovedFixturePath("sub/fixture.json")).toThrow(
      FixtureNotApprovedError,
    );
  });

  it("rejects an empty name", () => {
    expect(() => resolveApprovedFixturePath("")).toThrow(
      FixtureNotApprovedError,
    );
  });
});
