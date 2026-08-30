// The incident evidence graph: links evidence to hypotheses, hypotheses to
// proposed actions, and approval requests to the evidence that justified
// them (see FINAL_VALIDATION_CHECKLIST.md "Evidence graph"). Alternative
// hypotheses are preserved, never deleted — ruling one out only sets
// `ruledOut: true` with a `reason`; every store below is append-only (no
// update or delete method), and every link is validated against IDs that
// actually exist in this graph before being recorded.
import { randomUUID } from "node:crypto";
import type { Clock } from "../demo/clock.js";
import { SystemClock } from "../demo/clock.js";
import {
  UnknownEvidenceReferenceError,
  UnknownHypothesisReferenceError,
} from "./errors.js";
import {
  EvidenceStore,
  type EvidenceId,
  type EvidenceInput,
  type EvidenceItem,
} from "./evidence.js";

export type HypothesisId = string;
export type ProposedActionId = string;

export interface HypothesisInput {
  readonly sessionId: string;
  readonly statement: string;
  readonly supportingEvidenceIds: readonly EvidenceId[];
  readonly ruledOut: boolean;
  readonly reason?: string;
}

export interface Hypothesis extends HypothesisInput {
  readonly id: HypothesisId;
  readonly recordedAt: string;
}

export interface ProposedActionInput {
  readonly sessionId: string;
  readonly toolName: string;
  readonly canonicalArgs: string;
  readonly supportingHypothesisIds: readonly HypothesisId[];
}

export interface ProposedAction extends ProposedActionInput {
  readonly id: ProposedActionId;
  readonly recordedAt: string;
}

export interface ApprovalEvidenceLink {
  readonly approvalRequestId: string;
  readonly evidenceIds: readonly EvidenceId[];
  readonly recordedAt: string;
}

export class EvidenceGraph {
  readonly evidence: EvidenceStore;
  private readonly hypotheses = new Map<HypothesisId, Hypothesis>();
  private readonly actions = new Map<ProposedActionId, ProposedAction>();
  private readonly approvalLinks = new Map<string, ApprovalEvidenceLink>();
  private readonly clock: Clock;

  constructor(clock: Clock = new SystemClock(), evidence?: EvidenceStore) {
    this.clock = clock;
    this.evidence = evidence ?? new EvidenceStore(clock);
  }

  recordEvidence(input: EvidenceInput): EvidenceItem {
    return this.evidence.record(input);
  }

  /** Records a hypothesis, rejecting it if it cites evidence IDs not present in this graph. Ruled-out hypotheses are kept, not removed — see module header. */
  recordHypothesis(input: HypothesisInput): Hypothesis {
    for (const evidenceId of input.supportingEvidenceIds) {
      if (!this.evidence.get(evidenceId)) {
        throw new UnknownEvidenceReferenceError(evidenceId);
      }
    }
    const hypothesis: Hypothesis = {
      ...input,
      id: randomUUID(),
      recordedAt: this.clock.now().toISOString(),
    };
    this.hypotheses.set(hypothesis.id, hypothesis);
    return hypothesis;
  }

  /** Records a proposed action, rejecting it if it cites hypothesis IDs not present in this graph. */
  recordProposedAction(input: ProposedActionInput): ProposedAction {
    for (const hypothesisId of input.supportingHypothesisIds) {
      if (!this.hypotheses.has(hypothesisId)) {
        throw new UnknownHypothesisReferenceError(hypothesisId);
      }
    }
    const action: ProposedAction = {
      ...input,
      id: randomUUID(),
      recordedAt: this.clock.now().toISOString(),
    };
    this.actions.set(action.id, action);
    return action;
  }

  /** Links a policy-layer approval request to the evidence IDs that justify it, rejecting unknown evidence IDs. */
  linkApprovalRequest(
    approvalRequestId: string,
    evidenceIds: readonly EvidenceId[],
  ): ApprovalEvidenceLink {
    for (const evidenceId of evidenceIds) {
      if (!this.evidence.get(evidenceId)) {
        throw new UnknownEvidenceReferenceError(evidenceId);
      }
    }
    const link: ApprovalEvidenceLink = {
      approvalRequestId,
      evidenceIds,
      recordedAt: this.clock.now().toISOString(),
    };
    this.approvalLinks.set(approvalRequestId, link);
    return link;
  }

  getEvidenceForApproval(approvalRequestId: string): readonly EvidenceItem[] {
    const link = this.approvalLinks.get(approvalRequestId);
    if (!link) {
      return [];
    }
    return link.evidenceIds
      .map((id) => this.evidence.get(id))
      .filter((item): item is EvidenceItem => item !== undefined);
  }

  getHypothesesForAction(actionId: ProposedActionId): readonly Hypothesis[] {
    const action = this.actions.get(actionId);
    if (!action) {
      return [];
    }
    return action.supportingHypothesisIds
      .map((id) => this.hypotheses.get(id))
      .filter(
        (hypothesis): hypothesis is Hypothesis => hypothesis !== undefined,
      );
  }

  listHypotheses(): readonly Hypothesis[] {
    return [...this.hypotheses.values()];
  }

  listProposedActions(): readonly ProposedAction[] {
    return [...this.actions.values()];
  }

  listApprovalLinks(): readonly ApprovalEvidenceLink[] {
    return [...this.approvalLinks.values()];
  }
}
