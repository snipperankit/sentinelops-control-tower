import { describe, expect, it } from "vitest";
import { FixedClock } from "../../harness/demo/clock.js";
import { AuditChain, GENESIS_HASH } from "../../harness/audit/chain.js";

const CLOCK = new FixedClock(new Date("2026-08-24T00:00:00.000Z"));

describe("AuditChain: hash-chain integrity", () => {
  it("links each entry's previousHash to the prior entry's hash, starting from genesis", () => {
    const chain = new AuditChain(CLOCK);
    const first = chain.append({
      type: "evidence.recorded",
      sessionId: "session-1",
      payload: { evidenceId: "ev-1" },
    });
    const second = chain.append({
      type: "approval.granted",
      sessionId: "session-1",
      payload: { approvalId: "approval-1" },
    });

    expect(first.previousHash).toBe(GENESIS_HASH);
    expect(second.previousHash).toBe(first.hash);
  });

  it("reports a valid chain for an untouched sequence of appended events", () => {
    const chain = new AuditChain(CLOCK);
    chain.append({ type: "evidence.recorded", sessionId: "s", payload: {} });
    chain.append({ type: "hypothesis.recorded", sessionId: "s", payload: {} });
    chain.append({ type: "mutation.executed", sessionId: "s", payload: {} });

    expect(chain.verifyChainIntegrity()).toEqual({ valid: true });
  });

  it("redacts sensitive payload fields before they are hashed and stored", () => {
    const chain = new AuditChain(CLOCK);
    const entry = chain.append({
      type: "approval.granted",
      sessionId: "s",
      payload: { approverIdentity: "alice", apiKey: "sk-123" },
    });

    expect(entry.payload.apiKey).toBe("[REDACTED]");
    expect(entry.payload.approverIdentity).toBe("alice");
  });
});

describe("AuditChain: modified evidence detection (tampered chain entries)", () => {
  it("detects a payload modified after the entry was appended", () => {
    const chain = new AuditChain(CLOCK);
    chain.append({
      type: "evidence.recorded",
      sessionId: "s",
      payload: { a: 1 },
    });
    const entries = chain.list() as unknown as Array<{
      payload: Record<string, unknown>;
    }>;
    // Simulates an external rewrite attempt directly against a stored entry.
    entries[0]!.payload["a"] = 999;

    expect(chain.verifyChainIntegrity()).toEqual({
      valid: false,
      brokenAtSequence: 0,
    });
  });

  it("detects a broken hash link when an entry's previousHash is tampered with", () => {
    const chain = new AuditChain(CLOCK);
    chain.append({ type: "evidence.recorded", sessionId: "s", payload: {} });
    chain.append({ type: "approval.granted", sessionId: "s", payload: {} });
    const entries = chain.list() as unknown as Array<{ previousHash: string }>;
    entries[1]!.previousHash = "f".repeat(64);

    const result = chain.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(1);
  });

  it("does not flag an untouched chain as broken", () => {
    const chain = new AuditChain(CLOCK);
    chain.append({
      type: "evidence.recorded",
      sessionId: "s",
      payload: { a: 1 },
    });
    chain.append({
      type: "approval.granted",
      sessionId: "s",
      payload: { b: 2 },
    });

    expect(chain.verifyChainIntegrity().valid).toBe(true);
  });
});
