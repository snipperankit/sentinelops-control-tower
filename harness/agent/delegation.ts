// Bounded delegation enforcement for specialist agents (see
// ARCHITECTURE.md "Agent boundaries", AGENTS.md "Non-negotiable safety
// rules"). This tracks delegation depth and total delegation count in
// plain, deterministic TypeScript — independent of the model's own
// behavior or prompt wording — so a runaway or looping delegation chain is
// a structural impossibility, not a hope.
//
// SAFETY INVARIANT: specialist agent specs (specialists.ts) never enable
// `dynamicSubAgents`, so a specialist has no TrueForge-level mechanism to
// delegate further at all. This tracker is defense in depth on top of that
// structural fact, and is what actually gets exercised by application code
// that fans out from the commander to specialists.
import type { SpecialistName } from "./specialist-result-schema.js";

export interface DelegationLimits {
  /** Maximum delegation-chain depth. 1 means only the commander may delegate; specialists may never delegate further. */
  readonly maxDepth: number;
  /** Maximum total delegations across one investigation, regardless of depth. */
  readonly maxDelegations: number;
}

/** One commander delegating once to each of the five specialists, no retries. */
export const DEFAULT_DELEGATION_LIMITS: DelegationLimits = {
  maxDepth: 1,
  maxDelegations: 5,
};

export abstract class DelegationError extends Error {
  abstract readonly code: string;
}

export class DelegationDepthExceededError extends DelegationError {
  readonly code = "delegation_depth_exceeded";
  constructor(readonly maxDepth: number) {
    super(`Delegation depth limit (${maxDepth}) exceeded`);
  }
}

export class DelegationBudgetExceededError extends DelegationError {
  readonly code = "delegation_budget_exceeded";
  constructor(readonly maxDelegations: number) {
    super(`Delegation budget (${maxDelegations}) exhausted`);
  }
}

export class DelegationLoopDetectedError extends DelegationError {
  readonly code = "delegation_loop_detected";
  constructor(
    readonly specialist: SpecialistName,
    readonly chain: readonly SpecialistName[],
  ) {
    super(
      `Delegation loop detected: "${specialist}" is already active in the delegation chain [${chain.join(" -> ")}]`,
    );
  }
}

export class UnauthorizedToolAccessError extends DelegationError {
  readonly code = "unauthorized_tool_access";
  constructor(
    readonly specialist: SpecialistName,
    readonly tool: string,
  ) {
    super(
      `Specialist "${specialist}" reported using tool "${tool}", which is outside its allowlist`,
    );
  }
}

export interface DelegationScope {
  /** Releases this delegation's depth/count reservation. Idempotent; always call in a `finally` block. */
  end(): void;
}

/**
 * Tracks the active delegation chain and total delegation count for one
 * investigation. `beginDelegation` throws before ever invoking a
 * specialist if the depth limit, budget, or a loop (the same specialist
 * already active in the chain) would be violated.
 */
export class DelegationTracker {
  private readonly chain: SpecialistName[] = [];
  private delegationCount = 0;

  constructor(
    private readonly limits: DelegationLimits = DEFAULT_DELEGATION_LIMITS,
  ) {}

  get depth(): number {
    return this.chain.length;
  }

  get count(): number {
    return this.delegationCount;
  }

  beginDelegation(specialist: SpecialistName): DelegationScope {
    if (this.chain.includes(specialist)) {
      throw new DelegationLoopDetectedError(specialist, [...this.chain]);
    }
    if (this.chain.length >= this.limits.maxDepth) {
      throw new DelegationDepthExceededError(this.limits.maxDepth);
    }
    if (this.delegationCount >= this.limits.maxDelegations) {
      throw new DelegationBudgetExceededError(this.limits.maxDelegations);
    }

    this.delegationCount += 1;
    this.chain.push(specialist);

    let ended = false;
    return {
      end: () => {
        if (ended) {
          return;
        }
        ended = true;
        const index = this.chain.lastIndexOf(specialist);
        if (index !== -1) {
          this.chain.splice(index, 1);
        }
      },
    };
  }
}

export interface DelegateOptions<
  TFindings extends { readonly toolsUsed: readonly string[] },
> {
  readonly specialist: SpecialistName;
  /** Static tool allowlist for this specialist (see specialists.ts's exported *_TOOLS constants). */
  readonly allowedTools: readonly string[];
  /** Invokes the specialist (a real TrueForge session in production, a fake in tests) and returns its parsed, typed findings. */
  readonly run: () => Promise<TFindings>;
}

/**
 * Orchestrates one bounded delegation: reserves tracker budget, runs the
 * specialist, verifies every tool it self-reports using is within its
 * static allowlist, and always releases the tracker slot — mirroring
 * policy/gateway.ts's re-validation pattern (never trust a claim without
 * an independent check).
 */
export class DelegationCoordinator {
  constructor(private readonly tracker: DelegationTracker) {}

  async delegate<TFindings extends { readonly toolsUsed: readonly string[] }>(
    options: DelegateOptions<TFindings>,
  ): Promise<TFindings> {
    const scope = this.tracker.beginDelegation(options.specialist);
    try {
      const result = await options.run();
      for (const tool of result.toolsUsed) {
        if (!options.allowedTools.includes(tool)) {
          throw new UnauthorizedToolAccessError(options.specialist, tool);
        }
      }
      return result;
    } finally {
      scope.end();
    }
  }
}
