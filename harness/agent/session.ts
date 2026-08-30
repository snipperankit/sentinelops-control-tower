// Injectable session/turn runner for the commander agent: starts and
// resumes TrueForge sessions, streams turn events into a SessionEventStore
// (preserving tool provenance), and never itself authorizes or executes a
// mutation — it only observes and records what the model and its attached
// (read-only) MCP tools produce (see AGENTS.md, spec.ts's safety invariant).
//
// Depends on the narrow TrueForgeClientLike interface rather than the
// concrete `TrueForge` SDK class, so tests can supply a fake client without
// a live TrueForge server (see tests/unit/agent-session.test.ts).
import { isEventDelta, type TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { extractToolProvenance, type SessionEventStore } from "./events.js";

/** Structural subset of the real SDK's `Stream<T>` needed to resume by sequence id (see events.ts's StoredSessionEvent.sequenceId doc). */
export interface TurnEventStream {
  withMetadata(): AsyncIterable<{
    readonly data: TrueForgeApi.TurnStreamingEvent;
    readonly id?: string;
  }>;
}

export interface TrueForgeClientLike {
  readonly sessions: {
    create(
      request: TrueForgeApi.CreateSessionRequest,
    ): Promise<TrueForgeApi.GetSessionResponse>;
    getTurn(
      sessionId: string,
      turnId: string,
    ): Promise<TrueForgeApi.GetTurnResponse>;
    createTurnStream(
      sessionId: string,
      request: TrueForgeApi.CreateTurnSessionsStreamRequest,
    ): Promise<TurnEventStream>;
    subscribeToTurn(
      sessionId: string,
      turnId: string,
      request?: TrueForgeApi.SubscribeToTurnSessionsRequest,
    ): Promise<TurnEventStream>;
  };
}

export interface InvestigationSessionHandle {
  readonly sessionId: string;
  readonly turnId: string;
  readonly state: TrueForgeApi.TurnState;
}

export interface StartInvestigationOptions {
  /** Name of the registered commander agent (see spec.ts's COMMANDER_AGENT_NAME). */
  readonly agentName: string;
  readonly initialMessage: string;
}

export interface StartSpecialistTurnOptions {
  /** Inline agent spec (see specialists.ts's build*AgentSpec() functions) — no prior registration in TrueForge is required, per the SDK's `{ agent: { spec } }` session-creation form. */
  readonly agentSpec: TrueForgeApi.AgentSpec;
  readonly initialMessage: string;
}

export class AgentSessionRunner {
  constructor(
    private readonly client: TrueForgeClientLike,
    private readonly eventStore: SessionEventStore,
  ) {}

  /** Creates a new session bound to the named commander agent and starts its first turn. */
  async startInvestigation(
    options: StartInvestigationOptions,
  ): Promise<InvestigationSessionHandle> {
    const session = await this.client.sessions.create({
      agent: { name: options.agentName },
    });
    const sessionId = session.data.id;

    const stream = await this.client.sessions.createTurnStream(sessionId, {
      input: [{ type: "user.message", content: options.initialMessage }],
    });

    return this.consumeStream(sessionId, undefined, stream);
  }

  /**
   * Starts a bounded specialist turn from an inline `AgentSpec` (no named
   * TrueForge registration needed — see `specialists.ts`). Used by
   * delegated specialist fan-out (`harness/server/specialist-fanout.ts`),
   * kept separate from `startInvestigation` because specialists are never
   * referenced by a registry name.
   */
  async startSpecialistTurn(
    options: StartSpecialistTurnOptions,
  ): Promise<InvestigationSessionHandle> {
    const session = await this.client.sessions.create({
      agent: { spec: options.agentSpec },
    });
    const sessionId = session.data.id;

    const stream = await this.client.sessions.createTurnStream(sessionId, {
      input: [{ type: "user.message", content: options.initialMessage }],
    });

    return this.consumeStream(sessionId, undefined, stream);
  }

  /**
   * Resumes an existing session's turn. If the turn already reached a
   * terminal state, returns it directly (per the SDK's documented
   * `getTurn` → branch pattern — no further streaming is needed). If still
   * running, resumes the live stream from the last locally-recorded
   * sequence id via `subscribeToTurn({ afterSequenceNumber })`.
   */
  async resumeInvestigation(
    sessionId: string,
    turnId: string,
  ): Promise<InvestigationSessionHandle> {
    const turn = await this.client.sessions.getTurn(sessionId, turnId);

    if (turn.data.state.status !== "running") {
      return { sessionId, turnId, state: turn.data.state };
    }

    const lastSequenceId = this.eventStore.lastSequenceIdForTurn(
      sessionId,
      turnId,
    );
    const stream = await this.client.sessions.subscribeToTurn(
      sessionId,
      turnId,
      {
        afterSequenceNumber:
          lastSequenceId === undefined ? null : Number(lastSequenceId),
      },
    );

    return this.consumeStream(sessionId, turnId, stream);
  }

  private async consumeStream(
    sessionId: string,
    knownTurnId: string | undefined,
    stream: TurnEventStream,
  ): Promise<InvestigationSessionHandle> {
    let turnId = knownTurnId;
    let state: TrueForgeApi.TurnState = { status: "running" };

    for await (const item of stream.withMetadata()) {
      const event = item.data;

      // Streaming deltas are a rendering optimization only; the
      // authoritative final message arrives in `turn.done.state.output`
      // (see TurnStateDone), so deltas are never persisted.
      if (isEventDelta(event)) {
        continue;
      }

      if (event.type === "turn.created") {
        turnId = event.turnId;
        state = event.state;
      } else if (event.type === "turn.done") {
        state = event.state;
      }

      if (turnId !== undefined) {
        const toolProvenance = extractToolProvenance(event);
        this.eventStore.append({
          sessionId,
          turnId,
          event,
          ...(item.id !== undefined ? { sequenceId: item.id } : {}),
          ...(toolProvenance !== undefined ? { toolProvenance } : {}),
        });
      }
    }

    if (turnId === undefined) {
      throw new Error(
        "Turn stream ended without ever emitting a turn.created event",
      );
    }

    return { sessionId, turnId, state };
  }
}
