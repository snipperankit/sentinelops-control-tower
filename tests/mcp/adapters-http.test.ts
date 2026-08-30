import { describe, it, expect } from "vitest";
import { createSessionApiServer } from "../../harness/server/http.js";

interface BitbucketOkResponse {
  ok: true;
  pr: { title: string; description: string; files: string[] };
}
interface ErrorResponse {
  error: string;
}
interface StatusResponse {
  ok: true;
  integrations: Record<string, "demo" | "live">;
}

describe("/api/adapters/bitbucket integration", () => {
  it("returns demo-mode PR data without requiring approval (read-only)", async () => {
    const server = createSessionApiServer({ port: 9994, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9994/api/adapters/bitbucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: "org",
          repoSlug: "repo",
          pull_request_id: 1,
        }),
      });
      const body = (await res.json()) as BitbucketOkResponse;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.pr.title).toContain("demo Bitbucket PR");
    } finally {
      await server.close();
    }
  });

  it("rejects a request missing required fields", async () => {
    const server = createSessionApiServer({ port: 9993, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9993/api/adapters/bitbucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: "org" }),
      });
      const body = (await res.json()) as ErrorResponse;
      expect(res.status).toBe(400);
      expect(body.error).toMatch(
        /workspace, repoSlug, and pull_request_id are required/,
      );
    } finally {
      await server.close();
    }
  });
});

describe("/api/adapters/status integration", () => {
  it("reports demo mode for every integration when no live credentials are configured", async () => {
    const server = createSessionApiServer({ port: 9992, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9992/api/adapters/status");
      const body = (await res.json()) as StatusResponse;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.integrations).toMatchObject({
        github: "demo",
        bitbucket: "demo",
        search: "demo",
      });
      // Every value must be either "demo" or "live", never a credential.
      for (const value of Object.values(body.integrations)) {
        expect(["demo", "live"]).toContain(value);
      }
    } finally {
      await server.close();
    }
  });
});

describe("mutating adapter routes are gated by the policy registry fix", () => {
  it("/api/adapters/slack without an approvalId fails closed with the approval-required reason, not an unknown-tool error", async () => {
    const server = createSessionApiServer({ port: 9991, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9991/api/adapters/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "#rnd", text: "hello" }),
      });
      const body = (await res.json()) as ErrorResponse;
      expect(res.status).toBe(500);
      expect(body.error).toMatch(/requires human approval/);
      expect(body.error).not.toMatch(/Unknown tool/);
    } finally {
      await server.close();
    }
  });

  it("/api/adapters/mail without an approvalId fails closed with the approval-required reason, not an unknown-tool error", async () => {
    const server = createSessionApiServer({ port: 9990, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9990/api/adapters/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "ops@example.com", subject: "hi" }),
      });
      const body = (await res.json()) as ErrorResponse;
      expect(res.status).toBe(500);
      expect(body.error).toMatch(/requires human approval/);
      expect(body.error).not.toMatch(/Unknown tool/);
    } finally {
      await server.close();
    }
  });
});
