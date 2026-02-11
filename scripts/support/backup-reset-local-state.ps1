param(
  [switch]$Reset,
  [switch]$PreserveModelFiles = $true,
  [string]$BackupRoot = "",
  [switch]$SkipBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$sourceRoot = Join-Path $env:APPDATA "voicewave\localcore"
if (-not (Test-Path $sourceRoot)) {
  throw "VoiceWave local state was not found at $sourceRoot"
}

if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  $BackupRoot = Join-Path $env:USERPROFILE "Desktop\voicewave-recovery-backups"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $BackupRoot "localcore-$timestamp"

if (-not $SkipBackup) {
  New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
  Copy-Item -Path $sourceRoot -Destination $backupPath -Recurse -Force
  Write-Host "Backup created: $backupPath"
}

if (-not $Reset) {
  Write-Host "Backup-only run complete."
  exit 0
}

$configPath = Join-Path $sourceRoot "config"
$dataPath = Join-Path $sourceRoot "data"
$modelsPath = Join-Path $dataPath "models"

if (Test-Path $configPath) {
  Remove-Item -Path $configPath -Recurse -Force
}

if (Test-Path (Join-Path $modelsPath "downloads")) {
  Remove-Item -Path (Join-Path $modelsPath "downloads") -Recurse -Force
}

if (-not $PreserveModelFiles -and (Test-Path $modelsPath)) {
  Remove-Item -Path $modelsPath -Recurse -Force
}

if (Test-Path (Join-Path $dataPath "model-quarantine")) {
  Remove-Item -Path (Join-Path $dataPath "model-quarantine") -Recurse -Force
}

if (Test-Path (Join-Path $dataPath "model-sources")) {
  Remove-Item -Path (Join-Path $dataPath "model-sources") -Recurse -Force
}

Write-Host "Local state reset complete."
if ($PreserveModelFiles) {
  Write-Host "Installed model binaries were preserved."
} else {
  Write-Host "Installed model binaries were removed."
}
