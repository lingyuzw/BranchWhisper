param(
  [switch]$SkipPreflight,
  [switch]$PrepareOnly,
  [switch]$BuildBackend,
  [string]$BackendExecutable = "",
  [switch]$UseLocalCopy = $true,
  [string]$BuildRoot = (Join-Path $env:LOCALAPPDATA "BranchWhisper\windows-build"),
  [string]$DesktopExePath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "BranchWhisper.exe")
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceRepoRoot = $RepoRoot.ProviderPath

function Copy-RepositoryForWindowsBuild {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (Test-Path $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $rootFiles = @("package.json", "package-lock.json", "README.md", ".gitignore", ".gitattributes")
  foreach ($file in $rootFiles) {
    $sourceFile = Join-Path $Source $file
    if (Test-Path $sourceFile) {
      Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $Destination $file) -Force
    }
  }

  $directories = @("apps", "frontend", "backend", "configs", "scripts")
  $excludeDirs = @("node_modules", "dist", "target", "gen", "__pycache__", ".pytest_cache", ".venv")

  foreach ($dir in $directories) {
    $sourceDir = Join-Path $Source $dir
    if (-not (Test-Path $sourceDir)) {
      continue
    }

    $sourceDir = (Resolve-Path $sourceDir).ProviderPath
    $destinationDir = Join-Path $Destination $dir
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

    Copy-DirectoryPruned -SourceRoot $sourceDir -DestinationRoot $destinationDir -ExcludeDirs $excludeDirs
  }
}

function Copy-DirectoryPruned {
  param(
    [string]$SourceRoot,
    [string]$DestinationRoot,
    [string[]]$ExcludeDirs
  )

  Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object {
    if ($_.PSIsContainer) {
      if ($ExcludeDirs -contains $_.Name) {
        return
      }

      $childDestination = Join-Path $DestinationRoot $_.Name
      New-Item -ItemType Directory -Force -Path $childDestination | Out-Null
      Copy-DirectoryPruned -SourceRoot $_.FullName -DestinationRoot $childDestination -ExcludeDirs $ExcludeDirs
      return
    }

    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestinationRoot $_.Name) -Force
  }
}

$WorkingRepoRoot = $SourceRepoRoot

if ($UseLocalCopy) {
  Write-Host "Copying repository to Windows-local build directory:"
  Write-Host "  $BuildRoot"
  Copy-RepositoryForWindowsBuild -Source $SourceRepoRoot -Destination $BuildRoot
  $WorkingRepoRoot = $BuildRoot
}

$DesktopRoot = Join-Path $WorkingRepoRoot "apps\desktop"

Push-Location $WorkingRepoRoot
try {
  Push-Location (Join-Path $WorkingRepoRoot "frontend")
  try {
    npm install
    npm run build
  } finally {
    Pop-Location
  }

  if ($BuildBackend) {
    $backendBuildScript = Join-Path $WorkingRepoRoot "scripts\build_windows_backend.ps1"
    & $backendBuildScript
    if ($LASTEXITCODE -ne 0) {
      throw "build_windows_backend.ps1 failed with exit code $LASTEXITCODE"
    }
    $BackendExecutable = Join-Path $env:LOCALAPPDATA "BranchWhisper\backend-build\dist\branchwhisper-backend\branchwhisper-backend.exe"
  }

  if ($BackendExecutable) {
    if (-not (Test-Path $BackendExecutable)) {
      throw "Backend executable does not exist: $BackendExecutable"
    }
    $env:BRANCHWHISPER_BACKEND_EXECUTABLE = (Resolve-Path $BackendExecutable).ProviderPath
    Write-Host "Using packaged backend executable:"
    Write-Host "  $env:BRANCHWHISPER_BACKEND_EXECUTABLE"
  }

  Push-Location $DesktopRoot
  try {
    npm install
  } finally {
    Pop-Location
  }

  if (-not $SkipPreflight) {
    node apps/desktop/src/preflight.mjs --format text
  }

  if ($PrepareOnly) {
    Write-Host "Windows build workspace prepared: $WorkingRepoRoot"
    return
  }

  Push-Location $DesktopRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }

  $ExePath = Join-Path $DesktopRoot "src-tauri\target\release\branchwhisper-desktop.exe"
  $BundlePath = Join-Path $DesktopRoot "src-tauri\target\release\bundle"

  if (-not (Test-Path $ExePath)) {
    throw "Desktop build finished but executable was not found: $ExePath"
  }

  $DesktopExeDirectory = Split-Path -Parent $DesktopExePath
  if (-not $DesktopExeDirectory) {
    throw "DesktopExePath must include a directory: $DesktopExePath"
  }

  New-Item -ItemType Directory -Force -Path $DesktopExeDirectory | Out-Null
  Copy-Item -LiteralPath $ExePath -Destination $DesktopExePath -Force

  Write-Host ""
  Write-Host "Windows desktop build finished."
  Write-Host "EXE: $ExePath"
  Write-Host "Desktop EXE: $DesktopExePath"
  Write-Host "Bundle: $BundlePath"
  if ($UseLocalCopy) {
    Write-Host "Build workspace: $WorkingRepoRoot"
  }
} finally {
  Pop-Location
}
