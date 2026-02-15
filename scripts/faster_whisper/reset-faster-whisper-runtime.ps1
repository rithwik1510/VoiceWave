param(
  [switch]$NoBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $raw = Get-Content -LiteralPath $Path -Raw
  $normalized = $raw.TrimStart([char]0xFEFF).Trim()
  if ([string]::IsNullOrWhiteSpace($normalized)) { return $null }
  return $normalized | ConvertFrom-Json
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )
  $json = $Value | ConvertTo-Json -Depth 12
  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Backup-FileIfPresent {
  param(
    [string]$SourcePath,
    [string]$BackupRoot
  )
  if (-not (Test-Path $SourcePath)) { return }
  $relative = $SourcePath.Substring(3) # drop "C:\"
  $dest = Join-Path $BackupRoot $relative
  $parent = Split-Path -Parent $dest
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Copy-Item -LiteralPath $SourcePath -Destination $dest -Force
}

function Get-VoiceWaveRoots {
  $candidates = @(
    (Join-Path $env:APPDATA "voicewave\localcore"),
    (Join-Path $env:APPDATA "VoiceWave\localcore"),
    (Join-Path $env:APPDATA "com\voicewave\localcore"),
    (Join-Path $env:LOCALAPPDATA "com.voicewave.localcore"),
    (Join-Path $env:LOCALAPPDATA "voicewave\localcore"),
    (Join-Path $env:LOCALAPPDATA "VoiceWave\localcore")
  )
  return $candidates |
    Where-Object { Test-Path $_ } |
    Select-Object -Unique
}

$roots = Get-VoiceWaveRoots
if ($roots.Count -eq 0) {
  Write-Host "No VoiceWave runtime roots found. Nothing to reset."
  exit 0
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $PWD "docs\phaseB\artifacts\fw-reset-backup-$timestamp"
if (-not $NoBackup) {
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
}

$totalFwInstalledRemoved = 0
$totalFwDownloadsRemoved = 0

foreach ($root in $roots) {
  $configDir = Join-Path $root "config"
  $dataDir = Join-Path $root "data"

  $modelsIndex = Join-Path $configDir "models.json"
  $downloadIndex = Join-Path $configDir "model-downloads.json"
  $settingsPath = Join-Path $configDir "settings.json"
  $fwCacheDir = Join-Path $dataDir "faster-whisper-cache"

  if (-not $NoBackup) {
    Backup-FileIfPresent -SourcePath $modelsIndex -BackupRoot $backupRoot
    Backup-FileIfPresent -SourcePath $downloadIndex -BackupRoot $backupRoot
    Backup-FileIfPresent -SourcePath $settingsPath -BackupRoot $backupRoot
  }

  if (Test-Path $fwCacheDir) {
    Remove-Item -LiteralPath $fwCacheDir -Recurse -Force
    Write-Host "Removed cache: $fwCacheDir"
  }

  $models = Read-JsonFile -Path $modelsIndex
  if ($null -ne $models -and $null -ne $models.installed) {
    $before = @($models.installed).Count
    $models.installed = @($models.installed | Where-Object { $_.modelId -notmatch "^fw-" })
    $after = @($models.installed).Count
    $removed = $before - $after
    if ($removed -gt 0) {
      $totalFwInstalledRemoved += $removed
      Write-JsonFile -Path $modelsIndex -Value $models
      Write-Host "Pruned $removed faster-whisper installed model entries from: $modelsIndex"
    }
  }

  $downloads = Read-JsonFile -Path $downloadIndex
  if ($null -ne $downloads -and $null -ne $downloads.downloads) {
    $before = @($downloads.downloads).Count
    $downloads.downloads = @($downloads.downloads | Where-Object { $_.modelId -notmatch "^fw-" })
    $after = @($downloads.downloads).Count
    $removed = $before - $after
    if ($removed -gt 0) {
      $totalFwDownloadsRemoved += $removed
      Write-JsonFile -Path $downloadIndex -Value $downloads
      Write-Host "Pruned $removed faster-whisper download checkpoints from: $downloadIndex"
    }
  }

  $settings = Read-JsonFile -Path $settingsPath
  if ($null -ne $settings) {
    $changed = $false
    if ($settings.activeModel -match "^fw-") {
      $settings.activeModel = "fw-small.en"
      $changed = $true
    }
    if ($settings.decodeMode -ne "balanced") {
      $settings.decodeMode = "balanced"
      $changed = $true
    }
    if ($changed) {
      Write-JsonFile -Path $settingsPath -Value $settings
      Write-Host "Reset faster-whisper runtime defaults in: $settingsPath"
    }
  }
}

Write-Host ""
Write-Host "Faster-Whisper reset complete."
Write-Host "Roots scanned: $($roots.Count)"
Write-Host "Installed fw entries removed: $totalFwInstalledRemoved"
Write-Host "Download checkpoints removed: $totalFwDownloadsRemoved"
if (-not $NoBackup) {
  Write-Host "Backup written to: $backupRoot"
}
Write-Host ""
Write-Host "Next steps:"
Write-Host "1) npm run tauri:dev"
Write-Host "2) Install fw-small.en again from Models"
Write-Host "3) Run 5 short dictation checks before trying long prompts"
