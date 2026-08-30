// Shared controller interface implemented by both the scripted demo
// controller (sessionController.ts) and the live session client
// (liveSessionClient.ts). App.tsx depends only on this interface, so it
// requires zero changes to switch between demo and live session sources.
import type { SessionViewModel } from "./types.js";

export interface IncidentController {
  getState(): SessionViewModel;
  subscribe(listener: (view: SessionViewModel) => void): () => void;
  /** Whether the currently active step can move forward on its own (no human decision pending). Live sessions are always server-driven, so this is always false there. */
  canAutoAdvance(): boolean;
  /** Advances an autonomous (agent-driven) step. No-op for live sessions (the server advances itself). */
  advance(): void;
  approve(): void;
  reject(reason: string): void;
  resume(): void;
  emergencyStop(): void;
}
