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

function Prepend-PathEntryIfExists([string]$pathEntry) {
  if (-not (Test-Path $pathEntry)) {
    return
  }

  $entries = $env:PATH -split ";"
  if ($entries -contains $pathEntry) {
    return
  }

  $env:PATH = "$pathEntry;$env:PATH"
}

function Add-BundlerToolsToPath {
  $candidatePaths = @(
    "C:\\Program Files (x86)\\NSIS",
    "C:\\Program Files\\NSIS",
    "C:\\Program Files (x86)\\WiX Toolset v3.14\\bin",
    "C:\\Program Files\\WiX Toolset v3.14\\bin"
  )

  foreach ($pathEntry in $candidatePaths) {
    Prepend-PathEntryIfExists $pathEntry
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
  $env:CARGO_TARGET_DIR = Join-Path $safeRoot "target-gnu-build"
}

function Test-TruthyValue([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $false
  }
  switch ($value.Trim().ToLowerInvariant()) {
    "1" { return $true }
    "true" { return $true }
    "yes" { return $true }
    "on" { return $true }
    default { return $false }
  }
}

function Test-CommandAvailable([string]$commandName) {
  $command = Get-Command $commandName -ErrorAction SilentlyContinue
  return $null -ne $command
}

function Resolve-BundleTargetArgs([string[]]$existingArgs) {
  $explicitBundles = $false
  if ($existingArgs) {
    foreach ($arg in $existingArgs) {
      if ($arg -eq "--bundles" -or $arg -eq "-b") {
        $explicitBundles = $true
        break
      }
    }
  }

  if ($explicitBundles) {
    return @()
  }

  $hasNsis = (Test-CommandAvailable "makensis.exe") -or (Test-CommandAvailable "makensis")
  $hasCandle = (Test-CommandAvailable "candle.exe") -or (Test-CommandAvailable "candle")
  $hasLight = (Test-CommandAvailable "light.exe") -or (Test-CommandAvailable "light")
  $hasWix = $hasCandle -and $hasLight

  if ($hasNsis -and $hasWix) {
    return @()
  }

  if ($hasNsis -and (-not $hasWix)) {
    Write-Warning "WiX bundler tools were not found (candle.exe + light.exe). Building NSIS installer only."
    return @("--bundles", "nsis")
  }

  if ((-not $hasNsis) -and $hasWix) {
    Write-Warning "NSIS bundler tool was not found (makensis.exe). Building MSI installer only."
    return @("--bundles", "msi")
  }

  throw "No supported Windows bundler tools were found. Install NSIS (makensis.exe) and/or WiX Toolset (candle.exe + light.exe), then rerun npm run tauri:build."
}

function Resolve-WhisperFeatureArgs {
  if (Test-TruthyValue $env:VOICEWAVE_DISABLE_CUDA_FEATURE) {
    return @()
  }

  $cudaToolkitDetected = $false
  $forceCuda = Test-TruthyValue $env:VOICEWAVE_FORCE_CUDA_FEATURE
  if ($forceCuda) {
    $cudaToolkitDetected = $true
  }
  elseif (-not [string]::IsNullOrWhiteSpace($env:CUDA_PATH)) {
    $cudaLibPath = Join-Path $env:CUDA_PATH "lib\\x64"
    if (Test-Path $cudaLibPath) {
      $cudaToolkitDetected = $true
    }
  }

  if (-not $cudaToolkitDetected) {
    return @()
  }

  if (-not (Test-CommandAvailable "cl.exe")) {
    if ($forceCuda) {
      throw "VOICEWAVE_FORCE_CUDA_FEATURE is set, but cl.exe was not found in PATH. Install Visual Studio Build Tools or unset VOICEWAVE_FORCE_CUDA_FEATURE."
    }
    Write-Warning "CUDA toolkit detected but cl.exe was not found. Falling back to CPU build for this build."
    return @()
  }

  if (-not [string]::IsNullOrWhiteSpace($env:CUDA_PATH)) {
    $cudaBinPath = Join-Path $env:CUDA_PATH "bin"
    if (Test-Path $cudaBinPath) {
      $env:PATH = "$cudaBinPath;$env:PATH"
    }
  }

  Write-Host "CUDA toolkit detected. Enabling whisper-cuda feature for this Tauri build."
  return @("--features", "whisper-cuda")
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Ensure-GnuRustToolchain
Add-MingwToPathIfAvailable
Add-BundlerToolsToPath
Ensure-NoSpaceTargetDir

$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-gnu"

$tauriCli = Join-Path $repoRoot "node_modules\.bin\tauri.cmd"
if (-not (Test-Path $tauriCli)) {
  throw "Tauri CLI not found at $tauriCli. Run npm install first."
}

$commandArgs = @("build")
$commandArgs += Resolve-WhisperFeatureArgs
$commandArgs += Resolve-BundleTargetArgs $TauriArgs
if ($TauriArgs) {
  $commandArgs += $TauriArgs
}

if ($DryRun) {
  Write-Host "Repo root: $repoRoot"
  Write-Host "RUSTUP_TOOLCHAIN=$env:RUSTUP_TOOLCHAIN"
  Write-Host "CARGO_TARGET_DIR=$env:CARGO_TARGET_DIR"
  Write-Host ($tauriCli + " " + ($commandArgs -join " "))
  exit 0
}

Push-Location $repoRoot
try {
  & $tauriCli @commandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "tauri build failed"
  }
}
finally {
  Pop-Location
}
