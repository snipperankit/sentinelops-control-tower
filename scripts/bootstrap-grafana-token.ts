// Bootstraps a Grafana API token for the local "live" docker-compose stack
// (see docker-compose.yml's `grafana`/`prometheus` services and README.md's
// "Local live stack" section) so mcp/observability/grafana-adapter.ts can
// run in live mode without any manual Grafana UI steps.
//
// What it does:
//   1. Waits for the local Grafana instance to report healthy.
//   2. Creates (or reuses) a Grafana service account, then mints a fresh
//      API token for it via Grafana's HTTP API, authenticating with the
//      default local admin/admin credentials (see docker-compose.yml).
//   3. Writes/updates GRAFANA_URL, GRAFANA_API_TOKEN, and
//      GRAFANA_DATASOURCE_UID in .env (creating it from .env.example if
//      it doesn't exist yet).
//
// This only ever talks to the local Grafana container started by
// `npm run live:up`; it never touches production credentials or a
// non-local Grafana instance, and it is not used by the sandbox.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const GRAFANA_URL = process.env.GRAFANA_URL ?? "http://localhost:3001";
const ADMIN_USER = process.env.GF_SECURITY_ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.GF_SECURITY_ADMIN_PASSWORD ?? "admin";
const DATASOURCE_UID = process.env.GRAFANA_DATASOURCE_UID ?? "prometheus";
const SERVICE_ACCOUNT_NAME = "sentinelops-local-adapter";

const authHeader = `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString("base64")}`;

async function waitForGrafana(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${GRAFANA_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // Grafana not reachable yet; retry.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Timed out waiting for Grafana at ${GRAFANA_URL}/api/health. Is \`npm run live:up\` running?`,
  );
}

async function findOrCreateServiceAccount(): Promise<number> {
  const searchRes = await fetch(
    `${GRAFANA_URL}/api/serviceaccounts/search?query=${encodeURIComponent(SERVICE_ACCOUNT_NAME)}`,
    { headers: { Authorization: authHeader } },
  );
  if (!searchRes.ok) {
    throw new Error(
      `Failed to search Grafana service accounts: ${searchRes.status} ${searchRes.statusText}`,
    );
  }
  const searchBody = (await searchRes.json()) as {
    serviceAccounts?: Array<{ id: number; name: string }>;
  };
  const existing = searchBody.serviceAccounts?.find(
    (sa) => sa.name === SERVICE_ACCOUNT_NAME,
  );
  if (existing) return existing.id;

  const createRes = await fetch(`${GRAFANA_URL}/api/serviceaccounts`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ name: SERVICE_ACCOUNT_NAME, role: "Viewer" }),
  });
  if (!createRes.ok) {
    throw new Error(
      `Failed to create Grafana service account: ${createRes.status} ${createRes.statusText}`,
    );
  }
  const createBody = (await createRes.json()) as { id: number };
  return createBody.id;
}

async function createToken(serviceAccountId: number): Promise<string> {
  const tokenRes = await fetch(
    `${GRAFANA_URL}/api/serviceaccounts/${serviceAccountId}/tokens`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `bootstrap-${Date.now()}` }),
    },
  );
  if (!tokenRes.ok) {
    throw new Error(
      `Failed to create Grafana API token: ${tokenRes.status} ${tokenRes.statusText}`,
    );
  }
  const tokenBody = (await tokenRes.json()) as { key: string };
  return tokenBody.key;
}

function upsertEnvVar(envPath: string, key: string, value: string): void {
  const line = `${key}=${value}`;
  const existing = readFileSync(envPath, "utf-8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, next, "utf-8");
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, "..");
  const envPath = resolve(repoRoot, ".env");
  const envExamplePath = resolve(repoRoot, ".env.example");
  if (!existsSync(envPath)) {
    copyFileSync(envExamplePath, envPath);
    console.log("Created .env from .env.example");
  }

  console.log(`Waiting for Grafana at ${GRAFANA_URL} ...`);
  await waitForGrafana();

  const serviceAccountId = await findOrCreateServiceAccount();
  const token = await createToken(serviceAccountId);

  upsertEnvVar(envPath, "GRAFANA_URL", GRAFANA_URL);
  upsertEnvVar(envPath, "GRAFANA_API_TOKEN", token);
  upsertEnvVar(envPath, "GRAFANA_DATASOURCE_UID", DATASOURCE_UID);

  console.log(
    `Wrote GRAFANA_URL, GRAFANA_API_TOKEN, and GRAFANA_DATASOURCE_UID to ${envPath}`,
  );
  console.log(
    "Restart any running harness/session-api process to pick up the new .env values.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
