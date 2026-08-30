import { describe, it, expect } from "vitest";
import { sendEmail } from "../../mcp/mail/google.js";
import { postMessage } from "../../mcp/messaging/slack.js";
import { runSql } from "../../mcp/db/postgres.js";
import { fetchPullRequest } from "../../mcp/github/adapter.js";
import { fetchBitbucketPullRequest } from "../../mcp/bitbucket/adapter.js";
import { searchWeb } from "../../mcp/web/search.js";

describe("mcp adapters demo mode", () => {
  it("runs gmail adapter in demo mode", async () => {
    const res = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      body: "x",
    });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("demo");
  });

  it("runs slack adapter in demo mode", async () => {
    const res = await postMessage({ channel: "#rnd", text: "hello" });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("demo");
  });

  it("runs postgres adapter in demo mode", async () => {
    const res = await runSql("select 1");
    expect(res.rowCount).toBeGreaterThanOrEqual(0);
  });

  it("runs github adapter in demo mode", async () => {
    const pr = await fetchPullRequest({
      owner: "org",
      repo: "repo",
      pull_number: 1,
    });
    expect(pr.title).toContain("demo PR");
  });

  it("runs bitbucket adapter in demo mode", async () => {
    const pr = await fetchBitbucketPullRequest({
      workspace: "org",
      repoSlug: "repo",
      pullRequestId: 1,
    });
    expect(pr.title).toContain("demo Bitbucket PR");
    expect(pr.files.length).toBeGreaterThan(0);
  });

  it("runs web search adapter in demo mode", async () => {
    const hits = await searchWeb("test query");
    expect(hits.length).toBeGreaterThan(0);
    const first = hits[0]!;
    expect(first.title).toContain("demo result");
  });
});
