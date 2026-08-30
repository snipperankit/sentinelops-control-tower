Param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Builds a full, sanitized copy of the repository suitable for manual
# drag-and-drop upload to GitHub's web UI (no git commit/push involved).
#
# Includes: all source, scripts, docs, *.md, *.json, config files.
# Excludes: node_modules, .git, local secrets/demo state, corporate certs,
#           local logs/crash dumps, previous backup/output folders.

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$out = Join-Path $root "github-upload\output\$(Get-Date -Format 'yyyyMMddTHHmmssZ')"
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Output "Assembling full sanitized copy at: $out"

$excludeDirs = @(
  '.git', 'node_modules', '.scrub_backup', '.certs', '.demo-state',
  'test-videos', 'test-results', 'playwright-report', 'blob-report',
  'coverage', 'dist',
  'submission-package\output', 'github-upload\output'
)
$excludeFiles = @('.env')
$excludeExtensions = @('.log', '.webm', '.zip')
$excludeNames = @('bash.exe.stackdump')

function Should-Skip($relativePath) {
  foreach ($d in $excludeDirs) {
    $normalized = $d -replace '/', '\'
    if ($relativePath -eq $normalized -or $relativePath.StartsWith("$normalized\")) { return $true }
  }
  return $false
}

Get-ChildItem -Path $root -Force | Where-Object { $_.Name -ne 'github-upload' } | ForEach-Object {
  $item = $_
  $rel = $item.Name
  if (Should-Skip $rel) { return }
  if ($item.PSIsContainer) {
    Write-Output "Copying directory: $rel"
    Copy-Item -Path $item.FullName -Destination (Join-Path $out $rel) -Recurse -Force
  } else {
    if ($excludeFiles -contains $item.Name) { return }
    if ($excludeNames -contains $item.Name) { return }
    if ($excludeExtensions -contains $item.Extension) { return }
    Copy-Item -Path $item.FullName -Destination (Join-Path $out $rel) -Force
  }
}

# Also copy the github-upload folder's own scripts/README for reference (not output/)
Copy-Item -Path (Join-Path $root 'github-upload') -Destination (Join-Path $out 'github-upload') -Recurse -Force -Exclude 'output'
if (Test-Path (Join-Path $out 'github-upload\output')) {
  Remove-Item -Recurse -Force (Join-Path $out 'github-upload\output')
}

# Belt-and-suspenders removal of anything excluded but nested deeper.
foreach ($d in @('.git','node_modules','.scrub_backup','.certs','.demo-state')) {
  Get-ChildItem -Path $out -Recurse -Directory -Force -Filter $d -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
}
Get-ChildItem -Path $out -Recurse -File -Include '*.log','bash.exe.stackdump' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -Force $_.FullName }
$envFile = Join-Path $out '.env'
if (Test-Path $envFile) { Remove-Item -Force $envFile }

Write-Output "Done. Verify no secrets remain, then drag-and-drop the CONTENTS of:"
Write-Output "  $out"
Write-Output "into the GitHub web upload page."
