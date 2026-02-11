param(
  [switch]$DryRun,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$TauriArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-GnuRustToolchain {
  $rustup = Join-Path $env:USERPROFILE ".cargo\bin\rustup.exe"
  if (-not (Test-Path $rustup)) {
    throw "rustup not found. Install Rust toolchain first."
  }
  $toolchain = "stable-x86_64-pc-windows-gnu"
  $installed = & $rustup toolchain list | Select-String -Pattern $toolchain -SimpleMatch
  if (-not $installed) {
    & $rustup toolchain install $toolchain
    if ($LASTEXITCODE -ne 0) {
      throw "failed installing $toolchain"
    }
  }
}

function Add-MingwToPathIfAvailable {
  $winlibsMingw = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
  if (Test-Path $winlibsMingw) {
    $env:PATH = "$winlibsMingw;$env:PATH"
    return
  }

  throw "MinGW toolchain not found at expected WinLibs path. Install BrechtSanders.WinLibs.POSIX.UCRT via winget."
}

function Stop-StaleViteDevProcesses([string]$repoPath) {
  $escapedRepoPath = [regex]::Escape($repoPath)
  $stale = Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match $escapedRepoPath -and
      (
        $_.CommandLine -match "vite(\.js)?" -or
        $_.CommandLine -match "npm-cli\.js run dev" -or
        $_.CommandLine -match "npm run dev"
      )
    } |
    Sort-Object ProcessId -Descending

  foreach ($proc in $stale) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped stale dev process: $($proc.ProcessId) [$($proc.Name)]"
    }
    catch {
      Write-Warning "Failed to stop process $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
}

function Stop-StaleVoiceWaveRuntimeProcesses {
  $stale = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("voicewave_core.exe", "cargo.exe", "rustc.exe") -and
      $_.CommandLine -and
      (
        $_.CommandLine -match "voicewave-tauri-target" -or
        $_.CommandLine -match "src-tauri" -or
        $_.CommandLine -match "x86_64-pc-windows-gnu"
      )
    } |
    Sort-Object ProcessId -Descending

  foreach ($proc in $stale) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped stale runtime process: $($proc.ProcessId) [$($proc.Name)]"
    }
    catch {
      Write-Warning "Failed to stop process $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
}

function Ensure-NoSpaceTargetDir {
  if ($env:VIBE_SAFE_TARGET_DIR) {
    $env:CARGO_TARGET_DIR = $env:VIBE_SAFE_TARGET_DIR
    return
  }

  $safeRoot = "C:\\voicewave-tauri"
  if (-not (Test-Path $safeRoot)) {
    New-Item -ItemType Directory -Path $safeRoot | Out-Null
  }
  $env:CARGO_TARGET_DIR = Join-Path $safeRoot "target-gnu"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Ensure-GnuRustToolchain
Add-MingwToPathIfAvailable
Stop-StaleViteDevProcesses $repoRoot
Stop-StaleVoiceWaveRuntimeProcesses
Ensure-NoSpaceTargetDir

$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-gnu"
$env:CARGO_BUILD_TARGET = "x86_64-pc-windows-gnu"

$commandArgs = @("exec", "tauri", "dev", "--", "--target", "x86_64-pc-windows-gnu")
if ($TauriArgs) {
  $commandArgs += $TauriArgs
}

if ($DryRun) {
  Write-Host "Repo root: $repoRoot"
  Write-Host "RUSTUP_TOOLCHAIN=$env:RUSTUP_TOOLCHAIN"
  Write-Host "CARGO_BUILD_TARGET=$env:CARGO_BUILD_TARGET"
  Write-Host "CARGO_TARGET_DIR=$env:CARGO_TARGET_DIR"
  Write-Host ("npm " + ($commandArgs -join " "))
  exit 0
}

Push-Location $repoRoot
try {
  npm @commandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "tauri dev failed"
  }
}
finally {
  Pop-Location
}
