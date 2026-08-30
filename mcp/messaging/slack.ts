// Minimal Slack adapter skeleton for demo mode.
// Real implementation should call Slack Web API with a bot token.
export interface PostSlackMessageParams {
  channel: string;
  text: string;
}

export interface PostSlackMessageResult {
  ok: boolean;
  mode: "demo" | "live";
  ts?: string;
}

const slackCache: { client?: any } = {};

export async function postMessage(
  params: PostSlackMessageParams,
): Promise<PostSlackMessageResult> {
  const token = process.env.SLACK_TOKEN;
  if (!token) {
    return { ok: true, mode: "demo", ts: new Date().toISOString() };
  }

  if (!slackCache.client) {
    const mod = await import("@slack/web-api");
    slackCache.client = new mod.WebClient(token);
  }
  const client = slackCache.client as any;

  const res = await client.chat.postMessage({
    channel: params.channel,
    text: params.text,
  });

  // Slack typings mark many fields optional, coerce into our response shape
  return {
    ok: Boolean((res as any).ok),
    mode: "live",
    ts: (res as any).ts,
  };
}

export default { postMessage };
