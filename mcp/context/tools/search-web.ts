// context.search_web — wraps mcp/web/search.ts's searchWeb as a real,
// agent-chainable ToolContract, e.g. for researching an unfamiliar error
// signature or library advisory during deployment investigation.
import { searchWeb } from "../../web/search.js";
import type { ToolContract } from "../contract.js";
import { BackendUnavailableError } from "../errors.js";
import {
  searchWebInputSchema,
  searchWebOutputSchema,
  type SearchWebInput,
  type SearchWebOutput,
} from "../schemas.js";

export const searchWebContract: ToolContract<SearchWebInput, SearchWebOutput> =
  {
    name: "context.search_web",
    description:
      "Searches the web for a query and returns up to `limit` results (title, snippet, url). Demo mode (no SEARCH_API_KEY/BING_API_KEY) returns deterministic synthetic results; live mode calls the Bing Web Search API.",
    inputSchema: searchWebInputSchema,
    outputSchema: searchWebOutputSchema,
    risk: "read-only",
    requiredScope: ["context:read"],
    timeoutMs: 5000,
    auditEventType: "context.search_web.invoked",
    execute: async (input, { clock }) => {
      const mode =
        process.env.SEARCH_API_KEY || process.env.BING_API_KEY
          ? "live"
          : "demo";
      let results;
      try {
        results = await searchWeb(input.query, input.limit);
      } catch (error) {
        throw new BackendUnavailableError(
          error instanceof Error ? error.message : String(error),
        );
      }
      return {
        results,
        provenance: {
          source: "web-search" as const,
          mode,
          retrievedAt: clock.now().toISOString(),
        },
      };
    },
  };
