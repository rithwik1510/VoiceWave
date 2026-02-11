param(
  [string]$VenvPath = ".venv-faster-whisper"
)

$ErrorActionPreference = "Stop"

function Resolve-PythonCommand {
  if ($env:VOICEWAVE_FASTER_WHISPER_PYTHON -and (Test-Path $env:VOICEWAVE_FASTER_WHISPER_PYTHON)) {
    return $env:VOICEWAVE_FASTER_WHISPER_PYTHON
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return "py -3"
  }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return "python"
  }
  throw "Python 3.9+ is required. Install Python and rerun."
}

Write-Host "VoiceWave Faster-Whisper CPU setup"
Write-Host "-----------------------------------"

$pythonCmd = Resolve-PythonCommand
Write-Host "Using python command: $pythonCmd"

$venvFullPath = Resolve-Path -LiteralPath "." | ForEach-Object { Join-Path $_.Path $VenvPath }
if (-not (Test-Path $venvFullPath)) {
  Write-Host "Creating virtual environment at $venvFullPath ..."
  Invoke-Expression "$pythonCmd -m venv `"$venvFullPath`""
}

$venvPython = Join-Path $venvFullPath "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  throw "Virtual environment python not found at $venvPython"
}

Write-Host "Upgrading pip/setuptools/wheel ..."
& $venvPython -m pip install --upgrade pip setuptools wheel

Write-Host "Installing faster-whisper ..."
& $venvPython -m pip install faster-whisper

Write-Host "Validating install ..."
& $venvPython -c "import faster_whisper; print('faster-whisper version:', getattr(faster_whisper, '__version__', 'unknown'))"

Write-Host ""
Write-Host "Setup complete."
Write-Host "Set this for VoiceWave runtime:"
Write-Host "  `$env:VOICEWAVE_FASTER_WHISPER_PYTHON = '$venvPython'"
