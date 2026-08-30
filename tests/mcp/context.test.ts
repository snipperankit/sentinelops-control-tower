import { describe, it, expect } from "vitest";
import { SystemClock } from "../../harness/demo/clock.js";
import { runTool } from "../../mcp/context/contract.js";
import { getGithubPullRequestContract } from "../../mcp/context/tools/get-github-pull-request.js";
import { getBitbucketPullRequestContract } from "../../mcp/context/tools/get-bitbucket-pull-request.js";
import { searchWebContract } from "../../mcp/context/tools/search-web.js";

const deps = { clock: new SystemClock() };

describe("context.get_github_pull_request", () => {
  it("returns deterministic demo-mode PR data when GITHUB_TOKEN is unset", async () => {
    const result = await runTool(
      getGithubPullRequestContract,
      { owner: "octocat", repo: "Hello-World", pullNumber: 1 },
      deps,
    );
    expect(result.title).toContain("demo PR");
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.provenance.source).toBe("github");
    expect(result.provenance.mode).toBe("demo");
  });

  it("rejects a non-positive pull number", async () => {
    await expect(
      runTool(
        getGithubPullRequestContract,
        { owner: "octocat", repo: "Hello-World", pullNumber: 0 },
        deps,
      ),
    ).rejects.toThrow(/Invalid arguments/);
  });
});

describe("context.get_bitbucket_pull_request", () => {
  it("returns deterministic demo-mode PR data when no Bitbucket credentials are set", async () => {
    const result = await runTool(
      getBitbucketPullRequestContract,
      { workspace: "org", repoSlug: "repo", pullRequestId: 1 },
      deps,
    );
    expect(result.title).toContain("demo Bitbucket PR");
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.provenance.source).toBe("bitbucket");
    expect(result.provenance.mode).toBe("demo");
  });

  it("rejects a missing workspace", async () => {
    await expect(
      runTool(
        getBitbucketPullRequestContract,
        { workspace: "", repoSlug: "repo", pullRequestId: 1 },
        deps,
      ),
    ).rejects.toThrow(/Invalid arguments/);
  });
});

describe("context.search_web", () => {
  it("returns deterministic demo-mode results when no search API key is set", async () => {
    const result = await runTool(
      searchWebContract,
      { query: "checkout error rate spike", limit: 3 },
      deps,
    );
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]?.title).toContain("demo result");
    expect(result.provenance.source).toBe("web-search");
    expect(result.provenance.mode).toBe("demo");
  });

  it("rejects an empty query", async () => {
    await expect(
      runTool(searchWebContract, { query: "", limit: 3 }, deps),
    ).rejects.toThrow(/Invalid arguments/);
  });
});
