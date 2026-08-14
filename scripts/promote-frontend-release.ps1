[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$CandidatePort = 4201,

  [ValidateRange(1024, 65535)]
  [int]$LivePort = 4200,

  [ValidatePattern('^\.next-[A-Za-z0-9._-]+$')]
  [string]$CandidateDirectory = '.next-candidate'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendDirectory = Join-Path $repoRoot 'apps\frontend'
$liveDirectory = Join-Path $frontendDirectory '.next'
$candidatePath = Join-Path $frontendDirectory $CandidateDirectory
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $frontendDirectory ".next-previous-$timestamp"
$failedDirectory = Join-Path $frontendDirectory ".next-failed-$timestamp"
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$node = Join-Path $stateDirectory 'Node22\node-v22.12.0-win-x64\node.exe'
$nextCli = Join-Path $repoRoot 'node_modules\next\dist\bin\next'
$watchdogTaskName = 'Publishly Interim Uptime'
$watchdogTask = Get-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
$watchdogWasEnabled = $null -ne $watchdogTask -and $watchdogTask.State -ne 'Disabled'
$promoted = $false
$newProcess = $null

function Get-ValidatedNextProcess {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [switch]$Required
  )

  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    if ($Required) {
      throw "No process is listening on port $Port."
    }
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction Stop
  $expectedCli = $nextCli.ToLowerInvariant()
  $expectedRepo = $repoRoot.ToLowerInvariant()
  $commandLine = [string]$process.CommandLine
  if (
    $commandLine.ToLowerInvariant().IndexOf($expectedCli, [StringComparison]::Ordinal) -lt 0 -or
    $commandLine.ToLowerInvariant().IndexOf($expectedRepo, [StringComparison]::Ordinal) -lt 0
  ) {
    throw "Port $Port belongs to PID $($process.ProcessId), which is not the expected Publishly Next.js process."
  }
  return $process
}

function Stop-ValidatedNextProcess {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [switch]$Required
  )

  $process = Get-ValidatedNextProcess -Port $Port -Required:$Required
  if (-not $process) {
    return
  }

  Stop-Process -Id $process.ProcessId -Force
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    $remainingProcess = Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
    $remainingListener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -eq $process.ProcessId } |
      Select-Object -First 1
    if (-not $remainingProcess -or -not $remainingListener) {
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Publishly Next.js PID $($process.ProcessId) did not release port $Port."
}

function Start-LiveFrontend {
  $env:NODE_ENV = 'production'
  $env:NODE_COMPILE_CACHE = Join-Path $stateDirectory 'NodeCompileCache\frontend-live'
  $env:PUBLISHLY_NEXT_DIST_DIR = '.next'
  $env:FRONTEND_URL = 'https://publishlyapi.com'
  $env:MAIN_URL = 'https://publishlyapi.com'
  $env:NEXT_PUBLIC_SITE_URL = 'https://publishlyapi.com'
  $env:NEXT_PUBLIC_BACKEND_URL = 'https://publishlyapi.com/api'
  $env:BACKEND_INTERNAL_URL = 'http://127.0.0.1:3000'
  $env:STORAGE_PROVIDER = 'local'

  return Start-Process -FilePath $node -ArgumentList @(
    $nextCli,
    'start',
    '-p',
    [string]$LivePort
  ) -WorkingDirectory $frontendDirectory -WindowStyle Hidden -RedirectStandardOutput (
    Join-Path $stateDirectory 'frontend.stdout.log'
  ) -RedirectStandardError (
    Join-Path $stateDirectory 'frontend.stderr.log'
  ) -PassThru
}

function Wait-ForLiveFrontend {
  param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

  $healthUrl = "http://127.0.0.1:$LivePort/api/health"
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    if ($Process.HasExited) {
      throw "Promoted frontend exited with code $($Process.ExitCode)."
    }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 5
      if ([int]$response.StatusCode -eq 200) {
        return
      }
    }
    catch {
      # Next.js may still be warming its production route cache.
    }
    Start-Sleep -Seconds 1
  }
  throw "Promoted frontend did not become healthy at $healthUrl."
}

foreach ($requiredFile in @(
  $node,
  $nextCli,
  (Join-Path $liveDirectory 'BUILD_ID'),
  (Join-Path $candidatePath 'BUILD_ID')
)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Frontend promotion file is missing: $requiredFile"
  }
}

if (-not $liveDirectory.StartsWith($frontendDirectory, [StringComparison]::OrdinalIgnoreCase) -or
    -not $candidatePath.StartsWith($frontendDirectory, [StringComparison]::OrdinalIgnoreCase) -or
    -not $backupDirectory.StartsWith($frontendDirectory, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Resolved release directories are outside the Publishly frontend directory.'
}

try {
  if ($watchdogWasEnabled) {
    Disable-ScheduledTask -TaskName $watchdogTaskName | Out-Null
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      if ((Get-ScheduledTask -TaskName $watchdogTaskName).State -ne 'Running') {
        break
      }
      Start-Sleep -Seconds 1
    }
    if ((Get-ScheduledTask -TaskName $watchdogTaskName).State -eq 'Running') {
      throw 'The Publishly uptime watchdog did not finish before the promotion window.'
    }
  }

  # The separately validated candidate may already have been stopped by a
  # previous, pre-swap attempt. The build tree itself remains the authority.
  Stop-ValidatedNextProcess -Port $CandidatePort
  Stop-ValidatedNextProcess -Port $LivePort -Required

  Move-Item -LiteralPath $liveDirectory -Destination $backupDirectory
  Move-Item -LiteralPath $candidatePath -Destination $liveDirectory
  $promoted = $true

  $newProcess = Start-LiveFrontend
  Wait-ForLiveFrontend -Process $newProcess

  [PSCustomObject]@{
    ProcessId = $newProcess.Id
    Port = $LivePort
    BuildId = (Get-Content -LiteralPath (Join-Path $liveDirectory 'BUILD_ID') -Raw).Trim()
    PreviousRelease = $backupDirectory
    RolledBack = $false
  }
}
catch {
  $promotionError = $_
  if ($newProcess -and -not $newProcess.HasExited) {
    Stop-Process -Id $newProcess.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $newProcess.Id -Timeout 15 -ErrorAction SilentlyContinue
  }

  if ($promoted -and (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
    if (Test-Path -LiteralPath $liveDirectory -PathType Container) {
      Move-Item -LiteralPath $liveDirectory -Destination $failedDirectory
    }
    Move-Item -LiteralPath $backupDirectory -Destination $liveDirectory
    $rollbackProcess = Start-LiveFrontend
    Wait-ForLiveFrontend -Process $rollbackProcess
  }
  throw $promotionError
}
finally {
  if ($watchdogWasEnabled) {
    Enable-ScheduledTask -TaskName $watchdogTaskName | Out-Null
  }
}
