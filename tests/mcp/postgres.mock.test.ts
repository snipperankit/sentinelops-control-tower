import { describe, it, expect, vi } from "vitest";

vi.mock("pg", () => {
  class MockClient {
    async query(opts: any) {
      return { rows: [{ a: 1 }], rowCount: 1 };
    }
    release() {}
  }
  class MockPool {
    async connect() {
      return new MockClient();
    }
  }
  return { Pool: MockPool };
});

import { runSql } from "../../mcp/db/postgres.js";

describe("mcp/postgres live-mode with pg mock", () => {
  it("returns rows when pg is available", async () => {
    process.env.POSTGRES_URL = "postgres://user:pass@localhost:5432/db";
    const res = (await runSql("select 1", [])) as any;
    expect(res.rowCount).toBe(1);
    expect(res.rows && res.rows.length).toBeGreaterThan(0);
    expect(res.rows[0].a).toBe(1);
    delete process.env.POSTGRES_URL;
  });
});
