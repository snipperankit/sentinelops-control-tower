// Minimal Google Mail adapter skeleton for demo mode.
// Real implementation should call Gmail APIs with OAuth2 tokens.
export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  ok: boolean;
  mode: "demo" | "live";
  detail?: string;
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GMAIL_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  if (!apiKey && !smtpHost) {
    // Demo-mode: pretend to send email and return a harmless success
    return {
      ok: true,
      mode: "demo",
      detail: `demo: email queued to ${params.to}`,
    };
  }

  // Local live-mode: relay through a local SMTP catcher (e.g. Mailpit via
  // docker-compose's `mailpit` service) when SMTP_HOST is set. This is
  // checked before the Gmail OAuth path so a local live stack (no cloud
  // credentials) takes priority over a partially-configured Gmail setup.
  if (smtpHost) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    });
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM ?? "sentinelops@localhost",
      to: params.to,
      subject: params.subject,
      text: params.body,
    });
    return { ok: true, mode: "live", detail: String(info.messageId) };
  }

  // Live-mode: attempt to send using Gmail API with OAuth2 client credentials
  // Required env vars for live send: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Gmail OAuth2 credentials: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN",
    );
  }

  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const raw = `To: ${params.to}\r\nSubject: ${params.subject}\r\n\r\n${params.body}`;
  const encoded = Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  return {
    ok: true,
    mode: "live",
    detail: String((res as any).data?.id ?? "sent"),
  };
}

export default { sendEmail };
