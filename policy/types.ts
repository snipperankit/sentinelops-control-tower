// Core types for the policy layer. See SECURITY.md "Approval security"
// and .github/instructions/policy.instructions.md for the binding
// requirements these types encode.
import type { Clock } from "../harness/demo/clock.js";

export type RiskLevel = "read-only" | "mutating" | "destructive";

export interface ToolRiskEntry {
  readonly toolName: string;
  readonly risk: RiskLevel;
  readonly requiredScope: readonly string[];
}

export interface ApprovalRequest {
  readonly sessionId: string;
  readonly toolName: string;
  readonly canonicalArgs: string;
  readonly argumentHash: string;
  readonly environment: string;
  readonly targetResource: string;
  readonly riskLevel: RiskLevel;
}

export interface ApprovalGrant {
  readonly id: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly argumentHash: string;
  readonly environment: string;
  readonly targetResource: string;
  readonly riskLevel: RiskLevel;
  readonly approverIdentity: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly consumed: boolean;
}

export type AuthorizationOutcome =
  | "allowed_read_only"
  | "allowed_with_approval"
  | "denied";

export interface AuthorizationDecision {
  readonly outcome: AuthorizationOutcome;
  readonly toolName: string;
  readonly sessionId: string;
  readonly reason: string;
  readonly approvalId?: string;
}

export type PolicyAuditEventType =
  | "tool.authorized"
  | "tool.denied"
  | "approval.created"
  | "approval.consumed"
  | "approval.rejected"
  | "kill_switch.activated"
  | "kill_switch.deactivated";

export interface PolicyAuditEvent {
  readonly type: PolicyAuditEventType;
  readonly occurredAt: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly outcome: string;
  readonly reason: string;
  readonly approvalId?: string;
  readonly approverIdentity?: string;
}

export interface PolicyAuditSink {
  record(event: PolicyAuditEvent): void;
}

export class InMemoryPolicyAuditSink implements PolicyAuditSink {
  private readonly events: PolicyAuditEvent[] = [];

  record(event: PolicyAuditEvent): void {
    this.events.push(event);
  }

  list(): readonly PolicyAuditEvent[] {
    return this.events;
  }
}

export interface PolicyDependencies {
  readonly clock: Clock;
  readonly auditSink: PolicyAuditSink;
}
