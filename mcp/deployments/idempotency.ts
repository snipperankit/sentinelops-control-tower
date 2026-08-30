// In-memory idempotency ledger for the deployments.rollback mutating tool.
// Prevents duplicate execution: a repeated call with the same idempotency
// key and identical canonical arguments replays the cached result instead of
// re-invoking the mutation; the same key reused with different arguments is
// rejected as a conflict (see errors.ts DuplicateIdempotencyKeyError).
//
// Not shared with the read-only tools; only deployments.rollback depends on
// this. A real deployment would back this with a durable store keyed by
// idempotency key with a TTL, not an in-process Map.

export interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly output: unknown;
}

export interface IdempotencyStore {
  get(key: string): IdempotencyRecord | undefined;
  put(key: string, fingerprint: string, output: unknown): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  put(key: string, fingerprint: string, output: unknown): void {
    this.records.set(key, { fingerprint, output });
  }
}
