// context.get_github_pull_request — wraps mcp/github/adapter.ts's
// fetchPullRequest as a real, agent-chainable ToolContract for the
// deployment investigator (correlating a suspect deployment with the PR
// that shipped it).
import { fetchPullRequest } from "../../github/adapter.js";
import type { ToolContract } from "../contract.js";
import { BackendUnavailableError } from "../errors.js";
import {
  getGithubPullRequestInputSchema,
  getGithubPullRequestOutputSchema,
  type GetGithubPullRequestInput,
  type GetGithubPullRequestOutput,
} from "../schemas.js";

export const getGithubPullRequestContract: ToolContract<
  GetGithubPullRequestInput,
  GetGithubPullRequestOutput
> = {
  name: "context.get_github_pull_request",
  description:
    "Fetches a GitHub pull request's title, body, and changed files for a given owner/repo/pull number. Demo mode (no GITHUB_TOKEN) returns a deterministic synthetic PR; live mode calls the real GitHub REST API.",
  inputSchema: getGithubPullRequestInputSchema,
  outputSchema: getGithubPullRequestOutputSchema,
  risk: "read-only",
  requiredScope: ["context:read"],
  timeoutMs: 5000,
  auditEventType: "context.get_github_pull_request.invoked",
  execute: async (input, { clock }) => {
    const mode = process.env.GITHUB_TOKEN ? "live" : "demo";
    let pr;
    try {
      pr = await fetchPullRequest({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.pullNumber,
      });
    } catch (error) {
      throw new BackendUnavailableError(
        error instanceof Error ? error.message : String(error),
      );
    }
    return {
      title: pr.title,
      body: pr.body,
      files: pr.files,
      provenance: {
        source: "github" as const,
        mode,
        retrievedAt: clock.now().toISOString(),
      },
    };
  },
};
