// Unit test for mcp/mail/google.ts's local-SMTP live path (used by the
// local live stack's `mailpit` container, see docker-compose.yml and
// README.md's "Local live stack" section): when SMTP_HOST is set, sendEmail
// relays through nodemailer instead of calling the Gmail API, and takes
// priority over a partially-configured Gmail setup.
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn(async () => ({ messageId: "test-message-id" }));
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock,
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("sendEmail SMTP live mode", () => {
  it("relays through a local SMTP host when SMTP_HOST is set", async () => {
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GMAIL_API_KEY;

    const { sendEmail } = await import("../../mcp/mail/google.js");
    const result = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      body: "hello",
    });

    expect(result).toEqual({
      ok: true,
      mode: "live",
      detail: "test-message-id",
    });
    expect(createTransportMock).toHaveBeenCalledWith({
      host: "localhost",
      port: 1025,
      secure: false,
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "sentinelops@localhost",
      to: "test@example.com",
      subject: "hi",
      text: "hello",
    });
  });

  it("prefers SMTP_HOST over Gmail OAuth when both are configured", async () => {
    process.env.SMTP_HOST = "localhost";
    process.env.GOOGLE_API_KEY = "some-key";
    process.env.GMAIL_CLIENT_ID = "should-not-be-used";
    process.env.GMAIL_CLIENT_SECRET = "should-not-be-used";
    process.env.GMAIL_REFRESH_TOKEN = "should-not-be-used";

    const { sendEmail } = await import("../../mcp/mail/google.js");
    const result = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      body: "hello",
    });

    expect(result.mode).toBe("live");
    expect(createTransportMock).toHaveBeenCalled();
  });
});
