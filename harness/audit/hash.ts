// Deterministic canonical JSON + SHA-256 hashing shared by evidence.ts and
// chain.ts within this directory. Mirrors policy/approval.ts's own
// canonicalization helper; deliberately not imported across the
// policy/harness boundary — see /memories/repo notes on this repo's
// small-local-duplication-over-cross-layer-coupling convention.
import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Deep, JSON-safe clone. Also matches the plain-JSON shape MCP tool output is expected to have (functions/undefined are dropped, not preserved). */
export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
