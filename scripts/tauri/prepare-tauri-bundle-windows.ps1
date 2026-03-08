Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ExistingPath([string[]]$candidates) {
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }
  return $null
}

function Resolve-MingwRuntimeDirectory {
  $pathEntries = @()
  if (-not [string]::IsNullOrWhiteSpace($env:PATH)) {
    $pathEntries += ($env:PATH -split ";")
  }

  $knownCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"),
    "C:\msys64\mingw64\bin",
    "C:\mingw64\bin"
  )

  $candidates = @()
  $candidates += $pathEntries
  $candidates += $knownCandidates

  $resolved = Resolve-ExistingPath $candidates
  if ($resolved) {
    return $resolved
  }

  return $null
}

function Resolve-DllSourcePath([string]$dllName, [string[]]$releaseRoots, [string]$mingwRuntimeDir, [string]$repoRoot) {
  $candidateDirectories = @()
  if ($mingwRuntimeDir) {
    $candidateDirectories += $mingwRuntimeDir
  }

  foreach ($releaseRoot in $releaseRoots) {
    if (-not (Test-Path $releaseRoot)) {
      continue
    }
    $candidateDirectories += $releaseRoot
  }

  $venvAvLibs = Join-Path $repoRoot ".venv-faster-whisper\Lib\site-packages\av.libs"
  if (Test-Path $venvAvLibs) {
    $candidateDirectories += $venvAvLibs
  }

  foreach ($directory in $candidateDirectories) {
    $candidatePath = Join-Path $directory $dllName
    if (Test-Path $candidatePath) {
      return $candidatePath
    }
  }

  return $null
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$resourceDir = Join-Path $repoRoot "src-tauri\windows"
$resourceDll = Join-Path $resourceDir "WebView2Loader.dll"

if (-not (Test-Path $resourceDir)) {
  New-Item -ItemType Directory -Path $resourceDir | Out-Null
}

$targetRoot = if ($env:CARGO_TARGET_DIR) {
  $env:CARGO_TARGET_DIR
}
else {
  Join-Path $repoRoot "src-tauri\target"
}

$releaseRoots = @()
if (-not [string]::IsNullOrWhiteSpace($env:CARGO_BUILD_TARGET)) {
  $releaseRoots += Join-Path $targetRoot "$($env:CARGO_BUILD_TARGET)\release"
}
$releaseRoots += Join-Path $targetRoot "release"

$loaderSource = $null
foreach ($releaseRoot in $releaseRoots) {
  if (-not (Test-Path $releaseRoot)) {
    continue
  }

  $rootLoader = Join-Path $releaseRoot "WebView2Loader.dll"
  if (Test-Path $rootLoader) {
    $loaderSource = $rootLoader
    break
  }

  $nestedLoader = Get-ChildItem -Path $releaseRoot -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "webview2-com-sys" -and $_.FullName -match "\\x64\\" } |
    Select-Object -First 1

  if ($null -ne $nestedLoader) {
    $loaderSource = $nestedLoader.FullName
    break
  }
}

if (-not $loaderSource) {
  throw "WebView2Loader.dll was not found in release outputs. Expected under $targetRoot."
}

Copy-Item -Path $loaderSource -Destination $resourceDll -Force
Write-Host "Prepared bundle resource: $resourceDll"

$mingwRuntimeDir = Resolve-MingwRuntimeDirectory
if (-not $mingwRuntimeDir) {
  throw "MinGW runtime directory was not found in PATH or known locations. Cannot package GNU runtime DLLs safely."
}

$requiredRuntimeDlls = @(
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "libwinpthread-1.dll"
)

foreach ($dllName in $requiredRuntimeDlls) {
  $dllSource = Resolve-DllSourcePath -dllName $dllName -releaseRoots $releaseRoots -mingwRuntimeDir $mingwRuntimeDir -repoRoot $repoRoot
  if (-not $dllSource) {
    throw "Required runtime DLL '$dllName' was not found in MinGW runtime, release outputs, or faster-whisper venv."
  }

  $resourceDestination = Join-Path $resourceDir $dllName
  Copy-Item -Path $dllSource -Destination $resourceDestination -Force
  Write-Host "Prepared bundle resource: $resourceDestination"

  foreach ($releaseRoot in $releaseRoots) {
    if (-not (Test-Path $releaseRoot)) {
      continue
    }
    $releaseDestination = Join-Path $releaseRoot $dllName
    if ((Resolve-Path $dllSource).Path -eq (Resolve-Path $releaseDestination -ErrorAction SilentlyContinue).Path) {
      continue
    }
    Copy-Item -Path $dllSource -Destination $releaseDestination -Force
  }
}
