// Minimal web search adapter skeleton for demo mode.
// Real implementation should call a search API (Bing, Google, or custom crawler).
export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export async function searchWeb(
  query: string,
  limit = 5,
): Promise<SearchResultItem[]> {
  const apiKey = process.env.SEARCH_API_KEY || process.env.BING_API_KEY;
  if (!apiKey) {
    // Demo-mode: return deterministic fake hits
    return Array.from({ length: Math.min(limit, 3) }).map((_, i) => ({
      title: `demo result ${i + 1} for ${query}`,
      snippet: `This is a demo snippet for ${query}`,
      url: `https://example.com/search?q=${encodeURIComponent(query)}#${i + 1}`,
    }));
  }
  // Live-mode: implement Bing Web Search API (if BING_API_KEY provided)
  const bingKey = process.env.BING_API_KEY || process.env.SEARCH_API_KEY;
  if (!bingKey) {
    throw new Error("No search API key available for live-mode");
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.max(1, Math.min(50, limit))),
  });
  const url = `https://api.bing.microsoft.com/v7.0/search?${params.toString()}`;
  const resp = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": bingKey },
  });
  if (!resp.ok) {
    throw new Error(`Search API error: ${resp.status} ${resp.statusText}`);
  }
  const body = (await resp.json()) as any;
  const pages = (body?.webPages?.value as any[]) || [];
  return (pages || []).slice(0, limit).map((p: any) => ({
    title: String(p.name ?? ""),
    snippet: String(p.snippet ?? ""),
    url: String(p.url ?? ""),
  }));
}

export default { searchWeb };
