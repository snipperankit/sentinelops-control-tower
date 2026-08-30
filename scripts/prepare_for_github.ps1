Param()

$ErrorActionPreference = 'Stop'

# Script to move local/demo sensitive files to .scrub_backup\<timestamp>
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ts = (Get-Date).ToString('yyyyMMddTHHmmssZ')
$backup = Join-Path $root ".scrub_backup\$ts"

Write-Output "Creating backup: $backup"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

function Move-IfExists($path) {
  $full = Join-Path $root $path
  if (Test-Path $full) {
    Write-Output "Moving $path -> .scrub_backup/$ts/"
    $dest = Join-Path $backup $path
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Move-Item -Path $full -Destination $dest -Force
  }
}

# Common artifacts
Move-IfExists ".demo-state"
Move-IfExists ".env"
Move-IfExists "incident_detail.json"
Move-IfExists "Usersq1495302Documentssentinelops-control-towerincident_detail.json"
Move-IfExists "test-videos"
Move-IfExists "test-results"

# Archive traces and media
Get-ChildItem -Path $root -Recurse -Depth 3 -Include *.webm,trace.zip,*.zip -File -ErrorAction SilentlyContinue | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length+1)
  $dest = Join-Path $backup $rel
  Write-Output "Archiving $rel"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Move-Item -Path $_.FullName -Destination $dest -Force
}

Write-Output "Backup complete: $backup"
Write-Output "Review the backup directory before deleting." 
