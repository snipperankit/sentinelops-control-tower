// Approved input fixtures for the sandbox: a fixed, read-only allowlist
// directory, deliberately separate from `harness/demo/fixtures/` (the
// mutable demo-world state). The sandbox must never see or touch demo
// world state directly — investigation evidence reaches the agent only
// through the read-only MCP tools; the sandbox only ever gets whatever
// snapshot data an approved fixture here explicitly contains.
import { basename, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureNotApprovedError } from "./errors.js";

export const APPROVED_FIXTURES_ROOT = fileURLToPath(
  new URL("./fixtures/", import.meta.url),
);

/**
 * Resolves an approved fixture name to its absolute host path. Rejects
 * anything that is not a plain basename inside `APPROVED_FIXTURES_ROOT`:
 * `..` segments, path separators, absolute paths, and symlink-style escapes
 * are all treated as path traversal attempts and rejected identically,
 * without inspecting the payload further.
 */
export function resolveApprovedFixturePath(name: string): string {
  if (
    name.length === 0 ||
    name !== basename(name) ||
    name.includes("..") ||
    isAbsolute(name)
  ) {
    throw new FixtureNotApprovedError(name);
  }

  const resolved = resolve(APPROVED_FIXTURES_ROOT, name);
  const rootWithSep = APPROVED_FIXTURES_ROOT.endsWith(sep)
    ? APPROVED_FIXTURES_ROOT
    : APPROVED_FIXTURES_ROOT + sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new FixtureNotApprovedError(name);
  }

  return resolved;
}
