// Minimal Postgres SQL runner skeleton for demo mode.
// Real implementation should connect to a database and run parametrized SQL.
import { z } from "zod";
import { Pool } from "pg";

const poolCache: { pool?: Pool } = {};

const QuerySchema = z.object({
  query: z.string().min(1),
  params: z.array(z.any()).optional(),
});

export const QueryResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())),
  rowCount: z.number(),
});

export type QueryResult = z.infer<typeof QueryResultSchema>;

export async function runSql(
  query: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const url = process.env.POSTGRES_URL;
  // Validate inputs early
  QuerySchema.parse({ query, params });

  if (!url) {
    // Demo-mode: return a small fake result for development.
    return { rows: [{ demo: "no-db" }], rowCount: 1 };
  }

  // Create a cached pool per-process to avoid reconnect storms
  if (!poolCache.pool) {
    poolCache.pool = new Pool({
      connectionString: url,
      statement_timeout: 10_000,
    });
  }

  const pool = poolCache.pool!;
  const client = await pool.connect();
  try {
    const res = await client.query({ text: query, values: params as any[] });
    // Normalize rows to plain objects
    const rows = Array.isArray(res.rows) ? res.rows : [];
    return { rows, rowCount: res.rowCount ?? rows.length };
  } finally {
    client.release();
  }
}

export default { runSql };
