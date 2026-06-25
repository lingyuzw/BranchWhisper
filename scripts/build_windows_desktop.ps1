param(
  [switch]$SkipPreflight,
  [switch]$PrepareOnly,
  [switch]$BuildBackend = $true,
  [string]$BackendExecutable = "",
  [switch]$UseLocalCopy = $true,
  [string]$BuildRoot = (Join-Path $env:LOCALAPPDATA "BranchWhisper\windows-build"),
  [string]$DesktopExePath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "BranchWhisper-Portable-DevOnly.exe"),
  [string]$DesktopInstallerPath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "BranchWhisper-Setup.exe")
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

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  try {
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Assert-BackendDesktopApiContract {
  param(
    [string]$ExecutablePath
  )

  if (-not $ExecutablePath) {
    throw "Backend executable is required for desktop API contract verification."
  }

  if (-not (Test-Path $ExecutablePath)) {
    throw "Backend executable does not exist: $ExecutablePath"
  }

  $port = Get-FreeTcpPort
  $backendWorkdir = Split-Path -Parent $ExecutablePath
  $contractOutLog = Join-Path $env:TEMP "branchwhisper-desktop-api-contract-$port.out.log"
  $contractErrLog = Join-Path $env:TEMP "branchwhisper-desktop-api-contract-$port.err.log"
  Remove-Item -LiteralPath $contractOutLog,$contractErrLog -Force -ErrorAction SilentlyContinue
  Write-Host "Verifying packaged backend desktop API contract on port $port..."

  $process = Start-Process `
    -FilePath $ExecutablePath `
    -ArgumentList @("--host", "127.0.0.1", "--port", [string]$port) `
    -WorkingDirectory $backendWorkdir `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $contractOutLog `
    -RedirectStandardError $contractErrLog

  try {
    $origin = "http://tauri.localhost"
    $baseUrl = "http://127.0.0.1:$port"
    $requiredRoutes = @(
      "/api/desktop/capabilities",
      "/api/config/api-providers",
      "/api/statistics"
    )

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Milliseconds 500
      try {
        $response = Invoke-WebRequest `
          -UseBasicParsing `
          -Uri "$baseUrl/api/desktop/capabilities" `
          -Headers @{ Origin = $origin } `
          -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
          $ready = $true
          break
        }
      } catch {
      }
    }

    if (-not $ready) {
      $tail = @()
      if (Test-Path $contractOutLog) { $tail += Get-Content -Tail 40 -LiteralPath $contractOutLog }
      if (Test-Path $contractErrLog) { $tail += Get-Content -Tail 40 -LiteralPath $contractErrLog }
      throw "Packaged backend did not expose /api/desktop/capabilities within 30 seconds. Logs: $contractOutLog / $contractErrLog`n$($tail -join "`n")"
    }

    foreach ($route in $requiredRoutes) {
      $response = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri "$baseUrl$route" `
        -Headers @{ Origin = $origin } `
        -TimeoutSec 5
      if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "Required desktop backend route failed: $route HTTP $($response.StatusCode)"
      }
    }

    $capabilities = Invoke-RestMethod `
      -Uri "$baseUrl/api/desktop/capabilities" `
      -Headers @{ Origin = $origin } `
      -TimeoutSec 5
    if ($capabilities.product -ne "BranchWhisper" -or [int]$capabilities.desktop_api_version -lt 2) {
      throw "Packaged backend desktop capabilities are too old: $($capabilities | ConvertTo-Json -Compress)"
    }
  } finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

function Copy-BackendRuntimeResource {
  param(
    [string]$BackendDistDirectory,
    [string]$DesktopRoot
  )

  if (-not $BackendDistDirectory) {
    throw "Backend distribution directory is required before packaging desktop resources."
  }

  if (-not (Test-Path $BackendDistDirectory)) {
    throw "Backend distribution directory does not exist: $BackendDistDirectory"
  }

  $resourceRoot = Join-Path $DesktopRoot "src-tauri\resources"
  $resourceBackend = Join-Path $resourceRoot "backend"
  if (Test-Path $resourceBackend) {
    Remove-Item -LiteralPath $resourceBackend -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $resourceRoot | Out-Null
  Copy-Item -LiteralPath $BackendDistDirectory -Destination $resourceBackend -Recurse -Force

  $resourceExecutable = Join-Path $resourceBackend "branchwhisper-backend.exe"
  if (-not (Test-Path $resourceExecutable)) {
    throw "Bundled backend resource is missing executable: $resourceExecutable"
  }

  return $resourceExecutable
}

function Get-WindowsInstallerArtifact {
  param(
    [string]$BundlePath
  )

  if (-not (Test-Path $BundlePath)) {
    throw "Desktop bundle directory was not found: $BundlePath"
  }

  $installer = Get-ChildItem -LiteralPath $BundlePath -Recurse -File -Filter "*.exe" |
    Where-Object { $_.FullName -match "\\nsis\\" -or $_.Name -match "setup|installer|BranchWhisper" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $installer) {
    throw "Windows installer was not found under bundle directory: $BundlePath"
  }

  return $installer.FullName
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
    Assert-BackendDesktopApiContract -ExecutablePath $env:BRANCHWHISPER_BACKEND_EXECUTABLE
    $backendDistDirectory = Split-Path -Parent $env:BRANCHWHISPER_BACKEND_EXECUTABLE
    $bundledBackendExecutable = Copy-BackendRuntimeResource `
      -BackendDistDirectory $backendDistDirectory `
      -DesktopRoot $DesktopRoot
    Write-Host "Bundled backend resource:"
    Write-Host "  $bundledBackendExecutable"
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
  Get-Process BranchWhisper -ErrorAction SilentlyContinue | Stop-Process -Force
  Get-Process branchwhisper-backend -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
  Copy-Item -LiteralPath $ExePath -Destination $DesktopExePath -Force
  $InstallerPath = Get-WindowsInstallerArtifact -BundlePath $BundlePath
  Copy-Item -LiteralPath $InstallerPath -Destination $DesktopInstallerPath -Force

  Write-Host ""
  Write-Host "Windows desktop build finished."
  Write-Host "EXE: $ExePath"
  Write-Host "Desktop dev-only EXE: $DesktopExePath"
  Write-Host "Do not copy the dev-only EXE to another computer. Share the installer instead."
  Write-Host "Installer: $InstallerPath"
  Write-Host "Desktop installer: $DesktopInstallerPath"
  Write-Host "Bundle: $BundlePath"
  if ($UseLocalCopy) {
    Write-Host "Build workspace: $WorkingRepoRoot"
  }
} finally {
  Pop-Location
}
