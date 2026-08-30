// Zod input/output schemas for context MCP tools. See
// .github/instructions/mcp.instructions.md — every tool validates all
// arguments at runtime.
import { z } from "zod";

export const provenanceSchema = z.object({
  source: z.enum(["github", "bitbucket", "web-search"]),
  mode: z.enum(["demo", "live"]),
  retrievedAt: z.string(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const getGithubPullRequestInputSchema = z.object({
  owner: z.string().min(1).max(200),
  repo: z.string().min(1).max(200),
  pullNumber: z.number().int().positive(),
});
export type GetGithubPullRequestInput = z.infer<
  typeof getGithubPullRequestInputSchema
>;

export const getGithubPullRequestOutputSchema = z.object({
  title: z.string(),
  body: z.string(),
  files: z.array(z.string()),
  provenance: provenanceSchema,
});
export type GetGithubPullRequestOutput = z.infer<
  typeof getGithubPullRequestOutputSchema
>;

export const getBitbucketPullRequestInputSchema = z.object({
  workspace: z.string().min(1).max(200),
  repoSlug: z.string().min(1).max(200),
  pullRequestId: z.number().int().positive(),
});
export type GetBitbucketPullRequestInput = z.infer<
  typeof getBitbucketPullRequestInputSchema
>;

export const getBitbucketPullRequestOutputSchema = z.object({
  title: z.string(),
  description: z.string(),
  files: z.array(z.string()),
  provenance: provenanceSchema,
});
export type GetBitbucketPullRequestOutput = z.infer<
  typeof getBitbucketPullRequestOutputSchema
>;

export const searchWebInputSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().positive().max(20).default(5),
});
export type SearchWebInput = z.infer<typeof searchWebInputSchema>;

export const searchWebOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      snippet: z.string(),
      url: z.string(),
    }),
  ),
  provenance: provenanceSchema,
});
export type SearchWebOutput = z.infer<typeof searchWebOutputSchema>;
