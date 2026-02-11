param(
  [switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-CargoPath {
  $cargo = Get-Command cargo -ErrorAction SilentlyContinue
  if ($cargo) {
    return $cargo.Source
  }
  $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  if (Test-Path $fallback) {
    return $fallback
  }
  throw "Cargo not found. Install Rust toolchain first."
}

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
  $wingetMingw = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
  if (Test-Path $wingetMingw) {
    $env:PATH = "$wingetMingw;$env:PATH"
  }
}

function Ensure-SpaceSafeJunction([string]$sourcePath) {
  $junctionPath = Join-Path $env:TEMP "voicewave-phase2-nospace"
  if (Test-Path $junctionPath) {
    $item = Get-Item $junctionPath -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq "Junction") {
      return $junctionPath
    }
    Remove-Item -LiteralPath $junctionPath -Force -Recurse
  }

  New-Item -ItemType Junction -Path $junctionPath -Target $sourcePath | Out-Null
  return $junctionPath
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$cargoExe = Resolve-CargoPath
Ensure-GnuRustToolchain
Add-MingwToPathIfAvailable
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP "voicewave-phase2-target"

if (-not $SkipFrontend) {
  Push-Location $repoRoot
  try {
    npm run test
    if ($LASTEXITCODE -ne 0) {
      throw "frontend tests failed"
    }

    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "frontend build failed"
    }
  }
  finally {
    Pop-Location
  }
}

Push-Location (Join-Path $repoRoot "src-tauri")
try {
  & $cargoExe +stable-x86_64-pc-windows-gnu test --no-default-features
  if ($LASTEXITCODE -ne 0) {
    throw "no-default-features rust tests failed"
  }
}
finally {
  Pop-Location
}

$spaceSafeRoot = Ensure-SpaceSafeJunction $repoRoot
$desktopManifest = Join-Path $spaceSafeRoot "src-tauri\Cargo.toml"
& $cargoExe +stable-x86_64-pc-windows-gnu test --manifest-path $desktopManifest --no-run
if ($LASTEXITCODE -ne 0) {
  throw "desktop-feature rust compile check failed"
}

Write-Host "Phase II validation complete."
