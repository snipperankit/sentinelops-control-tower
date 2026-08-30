// Constructs the TrueForge SDK client from environment variables. Kept as
// a thin factory so harness/agent/session.ts depends only on the narrow
// TrueForgeClientLike interface (client-like.ts) for testability, never on
// this concrete constructor.
import { TrueForge } from "@truefoundry/trueforge-sdk";

export interface TrueForgeClientEnv {
  readonly TRUEFORGE_BASE_URL?: string;
  readonly TRUEFORGE_TOKEN?: string;
}

const DEFAULT_BASE_URL = "http://localhost:8790";

/**
 * Builds a real TrueForge SDK client. `env` defaults to `process.env`; pass
 * an explicit object in tests rather than mutating global environment
 * variables.
 */
export function createTrueForgeClient(
  env: TrueForgeClientEnv = process.env,
): TrueForge {
  return new TrueForge({
    baseUrl: env.TRUEFORGE_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutInSeconds: 600,
    ...(env.TRUEFORGE_TOKEN ? { token: env.TRUEFORGE_TOKEN } : {}),
  });
}
