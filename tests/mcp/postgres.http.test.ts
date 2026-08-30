import { describe, it, expect } from "vitest";
import { createSessionApiServer } from "../../harness/server/http.js";

describe("/api/adapters/postgres integration", () => {
  it("allows read-only query without approval", async () => {
    const server = createSessionApiServer({ port: 9999, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9999/api/adapters/postgres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "select 1 as v" }),
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result).toBeDefined();
    } finally {
      await server.close();
    }
  });

  it("rejects mutating query without approval", async () => {
    const server = createSessionApiServer({ port: 9998, corsOrigin: "*" });
    try {
      const res = await fetch("http://localhost:9998/api/adapters/postgres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "update users set name='x' where id=1" }),
      });
      const body = (await res.json()) as any;
      // Policy gateway should deny and return 500 with error message
      expect(res.status).toBe(500);
      expect(body.error).toBeDefined();
    } finally {
      await server.close();
    }
  });
});
