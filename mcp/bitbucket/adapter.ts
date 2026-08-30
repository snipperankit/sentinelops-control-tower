// Bitbucket adapter: demo mode by default, real Bitbucket Cloud REST API v2
// calls when credentials are configured. Mirrors mcp/github/adapter.ts's
// demo/live shape so both can be wrapped by the same context tool contract
// pattern (see mcp/context/tools/get-bitbucket-pull-request.ts).
export interface FetchBitbucketPrParams {
  workspace: string;
  repoSlug: string;
  pullRequestId: number;
}

export interface BitbucketPrSummary {
  title: string;
  description: string;
  files: string[];
}

function buildAuthHeader(): string | undefined {
  const token = process.env.BITBUCKET_ACCESS_TOKEN;
  if (token) return `Bearer ${token}`;
  const username = process.env.BITBUCKET_USERNAME;
  const appPassword = process.env.BITBUCKET_APP_PASSWORD;
  if (username && appPassword) {
    return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
  }
  return undefined;
}

export async function fetchBitbucketPullRequest(
  params: FetchBitbucketPrParams,
): Promise<BitbucketPrSummary> {
  const authHeader = buildAuthHeader();
  if (!authHeader) {
    // Demo-mode: return a synthetic PR summary, no network call.
    return {
      title: `demo Bitbucket PR ${params.pullRequestId}`,
      description: "Demo Bitbucket pull request description",
      files: ["src/index.ts", "README.md"],
    };
  }

  const headers = {
    Accept: "application/json",
    Authorization: authHeader,
  };

  const prUrl = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(
    params.workspace,
  )}/${encodeURIComponent(params.repoSlug)}/pullrequests/${encodeURIComponent(
    String(params.pullRequestId),
  )}`;

  const prResp = await fetch(prUrl, { headers });
  if (!prResp.ok) {
    throw new Error(
      `Failed to fetch Bitbucket PR: ${prResp.status} ${prResp.statusText}`,
    );
  }
  const prJson = (await prResp.json()) as Record<string, unknown>;

  const diffstatResp = await fetch(`${prUrl}/diffstat`, { headers });
  if (!diffstatResp.ok) {
    throw new Error(
      `Failed to fetch Bitbucket PR diffstat: ${diffstatResp.status} ${diffstatResp.statusText}`,
    );
  }
  const diffstatJson = (await diffstatResp.json()) as Record<string, unknown>;

  const title = String(prJson.title ?? "");
  const description = String(prJson.description ?? "");
  const values = Array.isArray(diffstatJson.values)
    ? (diffstatJson.values as Array<Record<string, unknown>>)
    : [];
  const files = values.map((entry) => {
    const newFile = entry.new as Record<string, unknown> | undefined;
    const oldFile = entry.old as Record<string, unknown> | undefined;
    return String(newFile?.path ?? oldFile?.path ?? "");
  });

  return { title, description, files };
}

export default { fetchBitbucketPullRequest };
