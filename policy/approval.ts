// Approval creation, canonical argument serialization, argument hashing,
// expiry check, one-time-use enforcement, and approver authorization.
// This is the binding-validation core of the HITL gate — see SECURITY.md
// "Approval security" for the full list of binding fields.
import { createHash, randomUUID } from "node:crypto";
import type { Clock } from "../harness/demo/clock.js";
import {
  ApprovalAlreadyUsedError,
  ApprovalArgumentMismatchError,
  ApprovalEnvironmentMismatchError,
  ApprovalExpiredError,
  ApprovalResourceMismatchError,
  ApprovalSessionMismatchError,
  ApprovalToolMismatchError,
  UnauthorizedApproverError,
} from "./errors.js";
import type { ApprovalGrant, ApprovalRequest } from "./types.js";

/** Default approval validity window in milliseconds (5 minutes). */
export const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;

/**
 * Deterministic, canonical serialization of tool arguments for hashing.
 * Keys are sorted recursively so structurally identical argument objects
 * always produce the same hash regardless of property insertion order.
 * This is the serialization the approval hash is computed against —
 * changing any argument value changes the hash, which invalidates the
 * approval (see THREAT_MODEL.md "Approval substitution").
 */
export function canonicalizeArguments(args: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(args));
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

export function hashArguments(canonicalArgs: string): string {
  return createHash("sha256").update(canonicalArgs).digest("hex");
}

export interface ApprovalStore {
  get(id: string): ApprovalGrant | undefined;
  put(grant: ApprovalGrant): void;
  markConsumed(id: string): void;
  list(): readonly ApprovalGrant[];
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly grants = new Map<string, ApprovalGrant>();

  get(id: string): ApprovalGrant | undefined {
    return this.grants.get(id);
  }

  put(grant: ApprovalGrant): void {
    this.grants.set(grant.id, grant);
  }

  markConsumed(id: string): void {
    const grant = this.grants.get(id);
    if (grant) {
      this.grants.set(id, { ...grant, consumed: true });
    }
  }

  list(): readonly ApprovalGrant[] {
    return [...this.grants.values()];
  }
}

// Simple file-backed approval store for demo persistence. The store keeps
// an in-memory map and writes its contents to `filePath` on every change.
// This is intentionally simple (no locking) because the demo server is a
// single-process Node instance. It tolerates a missing file by starting
// with an empty store.
import { promises as fs } from "fs";
import { dirname } from "path";

export class FileApprovalStore implements ApprovalStore {
  private readonly grants = new Map<string, ApprovalGrant>();
  constructor(private readonly filePath: string) {
    void this.load().catch(() => undefined);
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as ApprovalGrant[];
      for (const g of parsed) this.grants.set(g.id, g);
    } catch (err) {
      // If file doesn't exist, create parent dir and leave store empty.
      if ((err as any)?.code === "ENOENT") {
        await fs.mkdir(dirname(this.filePath), { recursive: true });
        await this.save();
        return;
      }
      throw err;
    }
  }

  private async save(): Promise<void> {
    const arr = [...this.grants.values()];
    await fs.writeFile(this.filePath, JSON.stringify(arr, null, 2), "utf8");
  }

  get(id: string): ApprovalGrant | undefined {
    return this.grants.get(id);
  }

  put(grant: ApprovalGrant): void {
    this.grants.set(grant.id, grant);
    void this.save();
  }

  markConsumed(id: string): void {
    const grant = this.grants.get(id);
    if (grant) {
      this.grants.set(id, { ...grant, consumed: true });
      void this.save();
    }
  }

  list(): readonly ApprovalGrant[] {
    return [...this.grants.values()];
  }
}

/** Fixed set of identities permitted to grant approvals. */
const AUTHORIZED_APPROVERS = new Set<string>([
  "operator",
  "admin",
  "incident-commander",
]);

export function isAuthorizedApprover(identity: string): boolean {
  return AUTHORIZED_APPROVERS.has(identity);
}

export interface CreateApprovalOptions {
  readonly request: ApprovalRequest;
  readonly approverIdentity: string;
  readonly clock: Clock;
  readonly ttlMs?: number;
}

export function createApproval(options: CreateApprovalOptions): ApprovalGrant {
  if (!isAuthorizedApprover(options.approverIdentity)) {
    throw new UnauthorizedApproverError(options.approverIdentity);
  }

  const now = options.clock.now();
  const ttl = options.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;

  return {
    id: randomUUID(),
    sessionId: options.request.sessionId,
    toolName: options.request.toolName,
    argumentHash: options.request.argumentHash,
    environment: options.request.environment,
    targetResource: options.request.targetResource,
    riskLevel: options.request.riskLevel,
    approverIdentity: options.approverIdentity,
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    consumed: false,
  };
}

export interface ValidateApprovalOptions {
  readonly grant: ApprovalGrant;
  readonly sessionId: string;
  readonly toolName: string;
  readonly argumentHash: string;
  readonly environment: string;
  readonly targetResource: string;
  readonly clock: Clock;
}

/**
 * Validates every binding field of an approval grant against the current
 * request. Throws a specific typed error for each mismatch category
 * (session, tool, args, environment, resource, expiry, reuse). The check
 * order is deliberate: cheapest / most common rejections first.
 */
export function validateApproval(options: ValidateApprovalOptions): void {
  const { grant } = options;

  if (grant.consumed) {
    throw new ApprovalAlreadyUsedError(grant.id);
  }

  const now = options.clock.now();
  if (now >= new Date(grant.expiresAt)) {
    throw new ApprovalExpiredError(grant.id, grant.expiresAt);
  }

  if (grant.sessionId !== options.sessionId) {
    throw new ApprovalSessionMismatchError(
      grant.id,
      grant.sessionId,
      options.sessionId,
    );
  }

  if (grant.toolName !== options.toolName) {
    throw new ApprovalToolMismatchError(
      grant.id,
      grant.toolName,
      options.toolName,
    );
  }

  if (grant.argumentHash !== options.argumentHash) {
    throw new ApprovalArgumentMismatchError(grant.id);
  }

  if (grant.environment !== options.environment) {
    throw new ApprovalEnvironmentMismatchError(
      grant.id,
      grant.environment,
      options.environment,
    );
  }

  if (grant.targetResource !== options.targetResource) {
    throw new ApprovalResourceMismatchError(grant.id);
  }

  // Defense-in-depth: re-validate the approver identity at authorization
  // time, not just at creation time. A grant injected directly into the
  // store (bypassing createApproval) with a forged approverIdentity must
  // still be rejected here.
  if (!isAuthorizedApprover(grant.approverIdentity)) {
    throw new UnauthorizedApproverError(grant.approverIdentity);
  }
}
