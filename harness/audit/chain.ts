// Tamper-evident, hash-linked audit event chain (see SECURITY.md "Audit
// security": "Audit records should include event hashes to detect
// modification"; THREAT_MODEL.md: "Audit tampering -> Hash-linked events").
// Append-only: there is no update or delete method, and every entry's hash
// covers the previous entry's hash, so altering, removing, or reordering
// any past entry is detectable by recomputing the chain from genesis.
import type { Clock } from "../demo/clock.js";
import { SystemClock } from "../demo/clock.js";
import { redactSensitiveFields } from "./redaction.js";
import { sha256, stableStringify } from "./hash.js";

/** Sentinel `previousHash` for the first entry in a chain. */
export const GENESIS_HASH = "0".repeat(64);

export interface AuditChainEventInput {
  readonly type: string;
  readonly sessionId: string;
  readonly payload: Record<string, unknown>;
}

export interface AuditChainEntry {
  readonly sequence: number;
  readonly type: string;
  readonly sessionId: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
  readonly previousHash: string;
  readonly hash: string;
}

export interface ChainIntegrityResult {
  readonly valid: boolean;
  readonly brokenAtSequence?: number;
}

type UnhashedEntry = Omit<AuditChainEntry, "hash">;

function computeEntryHash(entry: UnhashedEntry): string {
  return sha256(stableStringify(entry));
}

export class AuditChain {
  private readonly entries: AuditChainEntry[] = [];
  private readonly clock: Clock;

  constructor(clock: Clock = new SystemClock()) {
    this.clock = clock;
  }

  /** Redacts the payload, links it to the previous entry's hash, and appends it. There is no method to edit or remove a past entry. */
  append(input: AuditChainEventInput): AuditChainEntry {
    const previousHash = this.entries.at(-1)?.hash ?? GENESIS_HASH;
    const unhashed: UnhashedEntry = {
      sequence: this.entries.length,
      type: input.type,
      sessionId: input.sessionId,
      payload: redactSensitiveFields(input.payload),
      occurredAt: this.clock.now().toISOString(),
      previousHash,
    };
    const entry: AuditChainEntry = {
      ...unhashed,
      hash: computeEntryHash(unhashed),
    };
    this.entries.push(entry);
    return entry;
  }

  list(): readonly AuditChainEntry[] {
    return this.entries;
  }

  /**
   * Recomputes every entry's hash from its own fields and its
   * `previousHash` link, and cross-checks that link against the
   * preceding entry's actual hash. Returns the sequence number of the
   * first entry where either check fails, if any.
   */
  verifyChainIntegrity(): ChainIntegrityResult {
    let expectedPreviousHash = GENESIS_HASH;
    for (const entry of this.entries) {
      const unhashed: UnhashedEntry = {
        sequence: entry.sequence,
        type: entry.type,
        sessionId: entry.sessionId,
        payload: entry.payload,
        occurredAt: entry.occurredAt,
        previousHash: entry.previousHash,
      };
      if (
        entry.previousHash !== expectedPreviousHash ||
        computeEntryHash(unhashed) !== entry.hash
      ) {
        return { valid: false, brokenAtSequence: entry.sequence };
      }
      expectedPreviousHash = entry.hash;
    }
    return { valid: true };
  }
}
