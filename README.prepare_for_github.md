# Preparing this repository for GitHub (safe scrub)

This project includes local-demo artifacts and test recordings that should NOT be committed to GitHub. The repository contains two helper scripts you can run locally to move these files into a timestamped backup folder under `.scrub_backup/`.

Files added:

- `scripts/prepare_for_github.sh` — Bash script (Linux/macOS/Git Bash on Windows).
- `scripts/prepare_for_github.ps1` — PowerShell script (Windows PowerShell / PowerShell Core).
- `.gitignore` — updated to ignore `.demo-state`, `.env`, test artifacts, and common media/traces.

Usage (Bash):

```bash
# from the repo root
bash scripts/prepare_for_github.sh
```

Usage (PowerShell):

```powershell
# from the repo root
.\scripts\prepare_for_github.ps1
```

The scripts only MOVE files into `.scrub_backup/<timestamp>/` — they do not commit, delete the backup, or push any changes. Review the backup directory contents before permanently deleting anything.
