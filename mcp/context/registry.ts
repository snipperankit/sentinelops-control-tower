// Registry of every context MCP tool contract. server.ts wires each entry
// to McpServer.registerTool(); tests exercise contracts directly via
// contract.ts's runTool() without a transport.
import type { ToolContract } from "./contract.js";
import { getGithubPullRequestContract } from "./tools/get-github-pull-request.js";
import { getBitbucketPullRequestContract } from "./tools/get-bitbucket-pull-request.js";
import { searchWebContract } from "./tools/search-web.js";

export const contextToolRegistry: readonly ToolContract<unknown, unknown>[] = [
  getGithubPullRequestContract,
  getBitbucketPullRequestContract,
  searchWebContract,
];
