// Minimal GitHub adapter skeleton for demo mode.
// Real implementation should call GitHub REST API using a token.
export interface FetchPrParams {
  owner: string;
  repo: string;
  pull_number: number;
}

export interface PrSummary {
  title: string;
  body: string;
  files: string[];
}

export async function fetchPullRequest(
  params: FetchPrParams,
): Promise<PrSummary> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Demo-mode: return a synthetic PR summary
    return {
      title: `demo PR ${params.pull_number}`,
      body: "Demo pull request body",
      files: ["src/index.ts", "README.md"],
    };
  }

  // Live-mode: call GitHub REST API using global fetch and the provided token.
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "sentinelops-control-tower/1.0",
  };

  const prUrl = `https://api.github.com/repos/${encodeURIComponent(
    params.owner,
  )}/${encodeURIComponent(params.repo)}/pulls/${encodeURIComponent(
    String(params.pull_number),
  )}`;

  const filesUrl = `${prUrl}/files`;

  const prResp = await fetch(prUrl, { headers });
  if (!prResp.ok) {
    throw new Error(
      `Failed to fetch PR: ${prResp.status} ${prResp.statusText}`,
    );
  }
  const prJson = await prResp.json();

  const filesResp = await fetch(filesUrl, { headers });
  if (!filesResp.ok) {
    throw new Error(
      `Failed to fetch PR files: ${filesResp.status} ${filesResp.statusText}`,
    );
  }
  const filesJson = await filesResp.json();

  const prObj = prJson as Record<string, unknown>;
  const title = String(prObj.title ?? "");
  const body = String(prObj.body ?? "");
  const files = Array.isArray(filesJson)
    ? (filesJson as Array<Record<string, unknown>>).map((f) =>
        String(f.filename ?? ""),
      )
    : [];

  return { title, body, files };
}

export default { fetchPullRequest };
