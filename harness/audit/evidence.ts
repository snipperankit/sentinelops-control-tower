// Evidence provenance: every finding gathered during an investigation is
// recorded with a unique ID, its source tool, query, observed timestamp,
// trust classification, and a hash of its (redacted) result — see
// FINAL_VALIDATION_CHECKLIST.md "Evidence model". `EvidenceStore` has no
// update or delete method: evidence, once recorded, can never be rewritten
// — AGENTS.md non-negotiable "Do not allow the model to rewrite source
// evidence" is a structural guarantee here, not a prompt instruction.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Clock } from "../demo/clock.js";
import { SystemClock } from "../demo/clock.js";
import { MissingEvidenceProvenanceError } from "./errors.js";
import { redactSensitiveFields } from "./redaction.js";
import { deepCloneJson, sha256, stableStringify } from "./hash.js";

export type EvidenceId = string;

const evidenceInputSchema = z.object({
  sessionId: z.string().min(1),
  /** Name of the MCP tool (or "specialist:<name>" for a specialist's own synthesis) that produced this evidence. */
  sourceTool: z.string().min(1),
  /** The query or input that produced this result, e.g. a tool call's arguments. */
  query: z.string().min(1),
  /** "trusted": produced by a scoped, read-only MCP tool call. "untrusted": free-form content the tool merely returned (log lines, runbook text, commit messages) — instructions embedded in it must never be followed, see THREAT_MODEL.md. */
  trust: z.enum(["trusted", "untrusted"]),
  /** Human-readable interpretation of what the result means for the investigation. */
  interpretation: z.string().min(1),
  /** Raw result payload. Redacted before storage; never persisted verbatim if it contains sensitive fields. */
  result: z.unknown(),
  /** ISO timestamp the evidence was observed. Defaults to the store's clock at record time. */
  observedAt: z.string().min(1).optional(),
});

export type EvidenceInput = z.infer<typeof evidenceInputSchema>;
export type EvidenceTrustClassification = EvidenceInput["trust"];

export interface EvidenceItem extends Readonly<
  Omit<EvidenceInput, "observedAt">
> {
  readonly id: EvidenceId;
  readonly resultHash: string;
  readonly observedAt: string;
  readonly recordedAt: string;
}

/** Recomputes the result hash from `item.result` and compares it to `item.resultHash` — false means the evidence was modified after recording. */
export function verifyEvidenceIntegrity(item: EvidenceItem): boolean {
  return sha256(stableStringify(item.result)) === item.resultHash;
}

export interface EvidenceReplay {
  readonly evidence: EvidenceItem;
  readonly integrityIntact: boolean;
}

export class EvidenceStore {
  private readonly items = new Map<EvidenceId, EvidenceItem>();
  private readonly clock: Clock;

  constructor(clock: Clock = new SystemClock()) {
    this.clock = clock;
  }

  /**
   * Validates provenance, redacts sensitive fields, hashes the (redacted)
   * result, and appends a new evidence item under a fresh unique ID.
   * Rejects the input outright (rather than recording a partial/placeholder
   * item) if required provenance is missing or empty.
   */
  record(input: EvidenceInput): EvidenceItem {
    const parsed = evidenceInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new MissingEvidenceProvenanceError(
        parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      );
    }

    const redactedResult = deepCloneJson(
      redactSensitiveFields(parsed.data.result),
    );
    const item: EvidenceItem = {
      id: randomUUID(),
      sessionId: parsed.data.sessionId,
      sourceTool: parsed.data.sourceTool,
      query: parsed.data.query,
      trust: parsed.data.trust,
      interpretation: parsed.data.interpretation,
      result: redactedResult,
      resultHash: sha256(stableStringify(redactedResult)),
      observedAt: parsed.data.observedAt ?? this.clock.now().toISOString(),
      recordedAt: this.clock.now().toISOString(),
    };
    this.items.set(item.id, item);
    return item;
  }

  get(id: EvidenceId): EvidenceItem | undefined {
    return this.items.get(id);
  }

  list(): readonly EvidenceItem[] {
    return [...this.items.values()];
  }

  /** Retrieves stored evidence exactly as recorded, plus an explicit integrity check — the mechanism behind "evidence is replayable". */
  replay(id: EvidenceId): EvidenceReplay | undefined {
    const evidence = this.get(id);
    if (!evidence) {
      return undefined;
    }
    return { evidence, integrityIntact: verifyEvidenceIntegrity(evidence) };
  }
}
