// Minimal injectable audit sink for the deployments.rollback mutating tool.
// A real, persisted, hash-linked audit store is future work (see
// ARCHITECTURE.md "Audit store", SECURITY.md "Audit security"); this
// in-memory sink records exactly one event per invocation so the tool and
// its tests can prove a mutating action is always auditable.

export interface AuditEvent {
  readonly type: string;
  readonly occurredAt: string;
  readonly service: string;
  readonly environment: string;
  readonly currentDeploymentId: string;
  readonly targetDeploymentId: string;
  readonly idempotencyKey: string;
  readonly outcome: "executed" | "duplicate";
}

export interface AuditSink {
  record(event: AuditEvent): void;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];

  record(event: AuditEvent): void {
    this.events.push(event);
  }

  list(): readonly AuditEvent[] {
    return this.events;
  }
}
