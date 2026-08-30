#!/usr/bin/env node
// CLI entrypoint for the session API server (npm run session:server).
import { createSessionApiServer } from "./http.js";

const port = Number(process.env.SESSION_API_PORT ?? "8810");
const corsOrigin =
  process.env.SESSION_API_CORS_ORIGIN ?? "http://localhost:5173";

const handle = createSessionApiServer({ port, corsOrigin });
console.error(
  `sentinelops session API listening on http://localhost:${handle.port} (CORS origin: ${corsOrigin})`,
);

process.on("SIGINT", () => {
  void handle.close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void handle.close().then(() => process.exit(0));
});
