param(
  [string]$OutputRoot = (Join-Path $env:LOCALAPPDATA "BranchWhisper\backend-build"),
  [string]$Python = "python",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceRepoRoot = $RepoRoot.ProviderPath
# PyInstaller entrypoint: backend/main.py
$BackendEntry = Join-Path $SourceRepoRoot "backend\main.py"
$DistRoot = Join-Path $OutputRoot "dist"
$WorkRoot = Join-Path $OutputRoot "work"
$SpecRoot = Join-Path $OutputRoot "spec"
$BackendExecutable = Join-Path $DistRoot "branchwhisper-backend\branchwhisper-backend.exe"

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$RepairHint
  )

  Write-Host "> $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE. $RepairHint"
  }
}

if (-not (Test-Path $BackendEntry)) {
  throw "Backend entry was not found: $BackendEntry"
}

New-Item -ItemType Directory -Force -Path $OutputRoot, $DistRoot, $WorkRoot, $SpecRoot | Out-Null

Invoke-Checked `
  -FilePath $Python `
  -Arguments @("--version") `
  -RepairHint "Install Python 3.11+ and make it available on PATH."

if (-not $SkipInstall) {
  Invoke-Checked `
    -FilePath $Python `
    -Arguments @("-m", "pip", "install", "pyinstaller") `
    -RepairHint "Install PyInstaller manually with: pip install pyinstaller"
}

Invoke-Checked `
  -FilePath $Python `
  -Arguments @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--name", "branchwhisper-backend",
    "--distpath", $DistRoot,
    "--workpath", $WorkRoot,
    "--specpath", $SpecRoot,
    "--paths", (Join-Path $SourceRepoRoot "backend"),
    "--collect-submodules", "api",
    "--collect-submodules", "app",
    "--collect-submodules", "core",
    "--collect-submodules", "data",
    "--collect-submodules", "diagnostics",
    "--collect-submodules", "dialog",
    "--collect-submodules", "domain",
    "--collect-submodules", "engagement",
    "--collect-submodules", "integration_runtime",
    "--collect-submodules", "media",
    "--collect-submodules", "memory",
    "--collect-submodules", "repositories",
    "--collect-submodules", "service_runtime",
    "--collect-submodules", "tools",
    $BackendEntry
  ) `
  -RepairHint "If imports are missing, install backend dependencies in this Python environment and rerun."

if (-not (Test-Path $BackendExecutable)) {
  throw "PyInstaller finished but backend executable was not found: $BackendExecutable"
}

Write-Host ""
Write-Host "Windows backend build finished."
Write-Host "EXE: $BackendExecutable"
Write-Host "Set this before desktop build if needed:"
Write-Host "`$env:BRANCHWHISPER_BACKEND_EXECUTABLE = '$BackendExecutable'"
