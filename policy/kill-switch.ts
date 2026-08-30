// Kill switch: a global, in-memory latch that instantly denies all
// mutations when activated. Checked at the top of the gateway's
// authorization path so it takes effect even if an approval is otherwise
// valid (see ARCHITECTURE.md "Failure behavior", SECURITY.md invariant 1).
import type { Clock } from "../harness/demo/clock.js";
import type { PolicyAuditSink } from "./types.js";

export class KillSwitch {
  private active = false;
  private activatedAt: string | undefined;

  constructor(
    private readonly clock: Clock,
    private readonly auditSink: PolicyAuditSink,
  ) {}

  activate(): void {
    this.active = true;
    this.activatedAt = this.clock.now().toISOString();
    this.auditSink.record({
      type: "kill_switch.activated",
      occurredAt: this.activatedAt,
      sessionId: "",
      toolName: "",
      outcome: "kill_switch_active",
      reason: "Kill switch activated — all mutations denied",
    });
  }

  deactivate(): void {
    this.active = false;
    this.auditSink.record({
      type: "kill_switch.deactivated",
      occurredAt: this.clock.now().toISOString(),
      sessionId: "",
      toolName: "",
      outcome: "kill_switch_deactivated",
      reason: "Kill switch deactivated",
    });
  }

  isActive(): boolean {
    return this.active;
  }
}
