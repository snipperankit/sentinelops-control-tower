import { describe, expect, it } from "vitest";
import {
  redactSensitiveFields,
  isSensitiveFieldName,
} from "../../harness/audit/redaction.js";

describe("redactSensitiveFields", () => {
  it("redacts known sensitive field names at the top level", () => {
    const result = redactSensitiveFields({
      apiKey: "sk-super-secret",
      accessToken: "tok-123",
      password: "hunter2",
      secret: "shh",
      authorization: "Bearer abc",
      cvv: "123",
      cardNumber: "4111111111111111",
      ssn: "123-45-6789",
    }) as Record<string, unknown>;

    for (const value of Object.values(result)) {
      expect(value).toBe("[REDACTED]");
    }
  });

  it("preserves non-sensitive fields unchanged", () => {
    const result = redactSensitiveFields({
      errorRate: 0.12,
      service: "checkout",
      deploymentId: "d-4521",
    });

    expect(result).toEqual({
      errorRate: 0.12,
      service: "checkout",
      deploymentId: "d-4521",
    });
  });

  it("redacts sensitive fields nested arbitrarily deep in objects and arrays", () => {
    const result = redactSensitiveFields({
      logs: [
        { line: "normal log line", metadata: { apiKey: "sk-123" } },
        { line: "another line", metadata: { errorRate: 0.5 } },
      ],
    }) as {
      logs: Array<{ line: string; metadata: Record<string, unknown> }>;
    };

    expect(result.logs[0]?.metadata.apiKey).toBe("[REDACTED]");
    expect(result.logs[1]?.metadata.errorRate).toBe(0.5);
    expect(result.logs[0]?.line).toBe("normal log line");
  });

  it("does not mutate the input value", () => {
    const input = { apiKey: "sk-123", service: "checkout" };
    const result = redactSensitiveFields(input);

    expect(input.apiKey).toBe("sk-123");
    expect(result).not.toBe(input);
  });

  it("identifies sensitive field names case-insensitively", () => {
    expect(isSensitiveFieldName("API_KEY")).toBe(true);
    expect(isSensitiveFieldName("Password")).toBe(true);
    expect(isSensitiveFieldName("errorRate")).toBe(false);
  });
});
