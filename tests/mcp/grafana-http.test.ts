import { describe, it, expect } from "vitest";
import { createSessionApiServer } from "../../harness/server/http.js";

describe("/api/adapters/grafana integration", () => {
  it("returns demo-mode points without requiring approval", async () => {
    const server = createSessionApiServer({ port: 9997, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9997/api/adapters/grafana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promQuery: "up",
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
          stepSeconds: 60,
        }),
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.mode).toBe("demo");
      expect(Array.isArray(body.points)).toBe(true);
      expect(body.points.length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("rejects a request missing required fields", async () => {
    const server = createSessionApiServer({ port: 9996, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9996/api/adapters/grafana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promQuery: "up" }),
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(body.error).toMatch(/promQuery, from, and to are required/);
    } finally {
      await server.close();
    }
  });
});
