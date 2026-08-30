# GitHub manual upload package

Since files are not being committed with `git`, use this to produce a **full,
sanitized copy** of the repository that you can drag-and-drop into GitHub's
web "Add file → Upload files" page.

## What's included

Everything: source code, `agents/`, `apps/`, `harness/`, `mcp/`, `policy/`,
`sandbox/`, `tests/`, `evals/`, `docs/`, all `*.md` docs, all `*.json`
manifests/fixtures, `Dockerfile`, `docker-compose.yml`, config files.

## What's excluded (sensitive / local-only, never upload these)

- `.git/`, `node_modules/` — regenerable, huge, or upload-blocking.
- `.env` — real local environment values (use `.env.example` instead).
- `.certs/` — corporate TLS-inspection CA chain (internal infra detail).
- `.demo-state/`, `.scrub_backup/` — local run artifacts / prior backups.
- `test-videos/`, `test-results/`, `playwright-report/`, `blob-report/`,
  `coverage/`, `dist/` — generated test/build output.
- `*.log`, `*.webm`, `*.zip`, `bash.exe.stackdump` — local logs, recordings,
  crash dumps.

## Usage

Bash (Linux/macOS/Git Bash):

```bash
bash github-upload/assemble_github_upload.sh
```

PowerShell (Windows):

```powershell
.\github-upload\assemble_github_upload.ps1
```

Each run creates a fresh timestamped folder under `github-upload/output/`.
Open that folder, confirm nothing sensitive is present, then select all its
contents and drag them into the GitHub "Upload files" page for your repo.

## Before uploading, double-check

- Open the generated folder and search for `.env`, tokens, or API keys.
- Confirm `.certs/` and `.demo-state/` are absent.
- Confirm no `node_modules/` or `.git/` folder was copied.
