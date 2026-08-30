Param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$out = Join-Path $root "output\$(Get-Date -Format 'yyyyMMddTHHmmssZ')"
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Output "Creating submission bundle at: $out"

$includeFiles = @(
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
  'docker-compose.yml',
  'Dockerfile',
  '.gitignore',
  'eslint.config.js'
)

$includeDirs = @('agents','apps','harness','mcp','policy','sandbox','scripts','tests')

$excludes = @('.git','node_modules','.scrub_backup','.certs','.env','.demo-state','test-videos','test-results','docs')

foreach ($f in $includeFiles) {
  $src = Join-Path $root "..\$f"
  if (Test-Path $src) { Copy-Item -Path $src -Destination $out -Force }
}

foreach ($d in $includeDirs) {
  $src = Join-Path $root "..\$d"
  if (Test-Path $src) {
    Write-Output "Copying $d"
    $dest = Join-Path $out $d
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    # Copy recursively but skip excluded patterns and markdown files
    Get-ChildItem -Path $src -Recurse -File | Where-Object {
      ($_.Extension -ne '.md') -and (-not ($excludes | ForEach-Object { $_ -and $_ -ne '' -and $_ -in $_ }))
    } | ForEach-Object {
      $rel = $_.FullName.Substring($src.Length+1)
      $target = Join-Path $dest $rel
      New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
      Copy-Item -Path $_.FullName -Destination $target -Force
    }
  }
}

Write-Output "Bundle assembled. Review $out before zipping or pushing."
