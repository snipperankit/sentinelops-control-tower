// context.get_bitbucket_pull_request — wraps mcp/bitbucket/adapter.ts's
// fetchBitbucketPullRequest as a real, agent-chainable ToolContract, an
// alternate SCM source alongside GitHub for the deployment investigator.
import { fetchBitbucketPullRequest } from "../../bitbucket/adapter.js";
import type { ToolContract } from "../contract.js";
import { BackendUnavailableError } from "../errors.js";
import {
  getBitbucketPullRequestInputSchema,
  getBitbucketPullRequestOutputSchema,
  type GetBitbucketPullRequestInput,
  type GetBitbucketPullRequestOutput,
} from "../schemas.js";

function isBitbucketConfigured(): boolean {
  return Boolean(
    process.env.BITBUCKET_ACCESS_TOKEN ||
    (process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_APP_PASSWORD),
  );
}

export const getBitbucketPullRequestContract: ToolContract<
  GetBitbucketPullRequestInput,
  GetBitbucketPullRequestOutput
> = {
  name: "context.get_bitbucket_pull_request",
  description:
    "Fetches a Bitbucket pull request's title, description, and changed files for a given workspace/repo slug/pull request id. Demo mode (no BITBUCKET_ACCESS_TOKEN or BITBUCKET_USERNAME+BITBUCKET_APP_PASSWORD) returns a deterministic synthetic PR; live mode calls the real Bitbucket Cloud REST API.",
  inputSchema: getBitbucketPullRequestInputSchema,
  outputSchema: getBitbucketPullRequestOutputSchema,
  risk: "read-only",
  requiredScope: ["context:read"],
  timeoutMs: 5000,
  auditEventType: "context.get_bitbucket_pull_request.invoked",
  execute: async (input, { clock }) => {
    const mode = isBitbucketConfigured() ? "live" : "demo";
    let pr;
    try {
      pr = await fetchBitbucketPullRequest({
        workspace: input.workspace,
        repoSlug: input.repoSlug,
        pullRequestId: input.pullRequestId,
      });
    } catch (error) {
      throw new BackendUnavailableError(
        error instanceof Error ? error.message : String(error),
      );
    }
    return {
      title: pr.title,
      description: pr.description,
      files: pr.files,
      provenance: {
        source: "bitbucket" as const,
        mode,
        retrievedAt: clock.now().toISOString(),
      },
    };
  },
};
