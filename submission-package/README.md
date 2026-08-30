# Submission package

This folder contains helper scripts to assemble a clean submission bundle suitable for publishing to GitHub.

What it does:

- Copies the project's essential source directories and manifest files into `submission-package/output/<timestamp>/`.
- Excludes local/demo artifacts and sensitive files: `.env`, `.demo-state`, `.scrub_backup`, `.certs`, `node_modules`, and most `*.md` files.

Usage (Linux/macOS/Git Bash):

```bash
bash submission-package/assemble_submission.sh
```

Usage (Windows PowerShell):

```powershell
.\submission-package\assemble_submission.ps1
```

Review the created bundle before zipping or pushing it to GitHub.
