[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not ('PublishlyWindowsProcessMemory' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PublishlyWindowsProcessMemory {
  [StructLayout(LayoutKind.Sequential)]
  public struct PriorityInformation { public uint MemoryPriority; }

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetProcessInformation(
    IntPtr process,
    int informationClass,
    ref PriorityInformation information,
    uint informationSize
  );
}
'@
}

$createdNew = $false
$mutex = [System.Threading.Mutex]::new(
  $true,
  'Local\PublishlyInterimUptimeWatchdog',
  [ref]$createdNew
)
if (-not $createdNew) {
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$logFile = Join-Path $stateDirectory 'interim-watchdog.log'
$cloudflared = 'C:\Users\Phliq\bin\cloudflared.exe'
$cloudflaredConfig = 'C:\Users\Phliq\.cloudflared\publishly-preview.yml'
$envFile = Join-Path $repoRoot '.env'
$hostEnvFile = Join-Path $stateDirectory 'publishly-host.env'
$orchestratorTaskName = 'Publishly Interim Orchestrator'
$valkeyTaskName = 'Publishly Interim Valkey Keepalive'
$postgresCtl = 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
$postgresData = Join-Path $stateDirectory 'Postgres18\data'
$postgresLog = Join-Path $stateDirectory 'Postgres18\postgres.log'
$temporalExecutable = Join-Path $stateDirectory 'Temporal\bin\temporal.exe'
$temporalDatabase = Join-Path $stateDirectory 'Temporal\publishly-temporal.db'
$temporalStdout = Join-Path $stateDirectory 'Temporal\temporal.stdout.log'
$temporalStderr = Join-Path $stateDirectory 'Temporal\temporal.stderr.log'
$backendDirectory = Join-Path $repoRoot 'apps\backend'
$orchestratorDirectory = Join-Path $repoRoot 'apps\orchestrator'
$frontendDirectory = Join-Path $repoRoot 'apps\frontend'
$backendMain = Join-Path $backendDirectory 'dist\apps\backend\src\main.js'
$orchestratorMain = Join-Path $orchestratorDirectory 'dist\apps\orchestrator\src\main.js'
$nextCli = Join-Path $repoRoot 'node_modules\next\dist\bin\next'
$capabilitySource = Join-Path $repoRoot 'data\bulk-scheduler-capabilities.json'
$node = Join-Path $stateDirectory 'Node22\node-v22.12.0-win-x64\node.exe'

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$nodeCompileCache = Join-Path $stateDirectory 'NodeCompileCache'
New-Item -ItemType Directory -Path $nodeCompileCache -Force | Out-Null

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw "Publishly Node 22 runtime is missing: $node"
}

function Write-WatchdogLog {
  param([string]$Message)
  $line = '{0} {1}' -f ([DateTimeOffset]::Now.ToString('o')), $Message
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Test-LocalPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [string]$TargetAddress = '127.0.0.1',
    [int]$TimeoutMilliseconds = 750
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $result = $client.BeginConnect($TargetAddress, $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) {
      return $false
    }
    $client.EndConnect($result)
    return $true
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

function Invoke-BoundedNativeProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [int]$TimeoutSeconds = 20
  )

  if ($ArgumentList | Where-Object { $_ -match '[\s"]' }) {
    throw 'class=data_problem code=watchdog_native_argument_invalid reason=Bounded watchdog arguments may not contain whitespace or quotes.'
  }
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = [string]::Join(' ', $ArgumentList)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "class=recoverable code=watchdog_native_start_failed reason=$FilePath could not be started."
  }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $completed = $process.WaitForExit($TimeoutSeconds * 1000)
  if (-not $completed) {
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  }
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = if ($completed) { $process.ExitCode } else { 1 }
  $process.Dispose()
  return [pscustomobject]@{
    TimedOut = -not $completed
    ExitCode = $exitCode
    Stdout = [string]$stdout
    Stderr = [string]$stderr
  }
}

function Ensure-LocalRedis {
  $status = Invoke-BoundedNativeProcess -FilePath 'wsl.exe' -ArgumentList @(
    '-d', 'Ubuntu', '--', 'systemctl', 'is-active', 'publishly-valkey.service'
  )
  if ($status.TimedOut) {
    throw 'class=recoverable code=valkey_wsl_timeout reason=WSL timed out while checking the exact Publishly Valkey service.'
  }
  if ($status.ExitCode -ne 0 -or ([string]$status.Stdout).Trim() -ne 'active') {
    $start = Invoke-BoundedNativeProcess -FilePath 'wsl.exe' -ArgumentList @(
      '-d', 'Ubuntu', '--', 'systemctl', 'start', 'publishly-valkey.service'
    )
    if ($start.TimedOut -or $start.ExitCode -ne 0) {
      throw "class=user_action_needed code=valkey_start_failed reason=The exact publishly-valkey.service did not start. Run scripts/install-interim-valkey.ps1. $([string]$start.Stderr)"
    }
    Write-WatchdogLog 'class=recoverable code=valkey_restarted reason=The durable Publishly Valkey service was stopped and has been restarted.'
  }
  $addressProbe = Invoke-BoundedNativeProcess -FilePath 'wsl.exe' -ArgumentList @(
    '-d', 'Ubuntu', '--', 'hostname', '-I'
  )
  $script:valkeyAddress = ([string]$addressProbe.Stdout -split '\s+' |
    Where-Object { $_ -match '^\d{1,3}(?:\.\d{1,3}){3}$' } |
    Select-Object -First 1)
  $parsedAddress = $null
  if (
    $addressProbe.TimedOut -or
    $addressProbe.ExitCode -ne 0 -or
    -not [System.Net.IPAddress]::TryParse($script:valkeyAddress, [ref]$parsedAddress) -or
    $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork
  ) {
    throw 'class=recoverable code=valkey_address_unavailable reason=The private Ubuntu WSL IPv4 address could not be resolved.'
  }
  for ($attempt = 0; $attempt -lt 15; $attempt++) {
    if (Test-LocalPort -TargetAddress $script:valkeyAddress -Port 6380) {
      Write-WatchdogLog 'class=success code=valkey_ready reason=Authenticated durable Valkey is accepting connections on the private Ubuntu WSL endpoint.'
      return $true
    }
    Start-Sleep -Seconds 2
  }
  throw 'class=recoverable code=valkey_not_ready reason=The durable Publishly Valkey service is active but its private Ubuntu WSL endpoint never became ready.'
}

function Get-PublishlyProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EntryPoint
  )

  return Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine.IndexOf($EntryPoint, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    Select-Object -First 1
}

function Stop-UnhealthyPublishlyProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$EntryPoint
  )

  $process = Get-PublishlyProcess -EntryPoint $EntryPoint
  if (-not $process) {
    throw "class=user_action_needed code=$($Name.ToLowerInvariant())_owner_missing reason=The unhealthy listener is not owned by the expected Publishly entry point."
  }
  $processId = [int]$process.ProcessId
  Stop-Process -Id $processId -Force
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
  }
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
    & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 500
    }
  }
  if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
    throw "class=recoverable code=$($Name.ToLowerInvariant())_stop_failed reason=The exact unhealthy Publishly process did not stop."
  }
  if ($Name -eq 'Orchestrator') {
    Stop-ScheduledTask -TaskName $orchestratorTaskName -ErrorAction SilentlyContinue
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      $ownerState = (Get-ScheduledTask -TaskName $orchestratorTaskName -ErrorAction SilentlyContinue).State
      if ($ownerState -ne 'Running') { break }
      Start-Sleep -Milliseconds 500
    }
    if ((Get-ScheduledTask -TaskName $orchestratorTaskName -ErrorAction SilentlyContinue).State -eq 'Running') {
      throw 'class=recoverable code=orchestrator_owner_stop_failed reason=The exact orchestrator scheduled-task owner did not settle after its worker stopped.'
    }
    Write-WatchdogLog 'class=recoverable code=orchestrator_owner_settled reason=The dedicated orchestrator task owner settled and is eligible for an exact relaunch.'
  }
  Write-WatchdogLog "class=recoverable code=$($Name.ToLowerInvariant())_unhealthy_stopped reason=The semantic health probe failed twice; exact PID $processId was stopped and launch logic will replace it."
}

function Test-BackendHealth {
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 5
    return [bool](
      $health.status -eq 'ok' -and
      $health.checks.database -eq $true -and
      $health.checks.redis -eq $true
    )
  }
  catch { return $false }
}

function Test-OrchestratorHealth {
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri 'http://127.0.0.1:3002/health/status' -TimeoutSec 5
    return [bool](
      $health.healthy -eq $true -and
      $health.checks.temporal -eq $true -and
      $health.checks.publishingEngine -eq $true
    )
  }
  catch { return $false }
}

function Test-FrontendHealth {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4200' -TimeoutSec 5
    return [bool]($health.StatusCode -eq 200)
  }
  catch { return $false }
}

function Test-ServiceHealth {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Backend', 'Orchestrator', 'Frontend')]
    [string]$Name
  )

  for ($attempt = 0; $attempt -lt 2; $attempt++) {
    $healthy = switch ($Name) {
      'Backend' { Test-BackendHealth }
      'Orchestrator' { Test-OrchestratorHealth }
      'Frontend' { Test-FrontendHealth }
    }
    if ($healthy) { return $true }
    if ($attempt -eq 0) { Start-Sleep -Seconds 2 }
  }
  return $false
}

function Wait-ServiceHealth {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Backend', 'Orchestrator', 'Frontend')]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [DateTimeOffset]$Deadline
  )

  $port = switch ($Name) {
    'Backend' { 3000 }
    'Orchestrator' { 3002 }
    'Frontend' { 4200 }
  }
  while ([DateTimeOffset]::Now -lt $Deadline) {
    $healthy = $false
    if (Test-LocalPort -Port $port) {
      $healthy = switch ($Name) {
        'Backend' { Test-BackendHealth }
        'Orchestrator' { Test-OrchestratorHealth }
        'Frontend' { Test-FrontendHealth }
      }
    }
    if ($healthy) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Start-PublishlyProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory
  )

  $startArguments = @{
    FilePath = $FilePath
    ArgumentList = $ArgumentList
    WorkingDirectory = $WorkingDirectory
    WindowStyle = 'Hidden'
    PassThru = $true
    RedirectStandardOutput = Join-Path $stateDirectory ("{0}.stdout.log" -f ($Name -replace '[^A-Za-z0-9._-]', '-').ToLowerInvariant())
    RedirectStandardError = Join-Path $stateDirectory ("{0}.stderr.log" -f ($Name -replace '[^A-Za-z0-9._-]', '-').ToLowerInvariant())
  }
  $process = Start-Process @startArguments
  if ($Name -in @('Backend', 'Orchestrator')) {
    try {
      $process.PriorityClass = 'AboveNormal'
      $process.MaxWorkingSet = [IntPtr](2GB)
      $process.MinWorkingSet = [IntPtr](256MB)
      $memoryPriority = New-Object PublishlyWindowsProcessMemory+PriorityInformation
      $memoryPriority.MemoryPriority = 5
      $memoryPrioritySize = [Runtime.InteropServices.Marshal]::SizeOf($memoryPriority)
      if (-not [PublishlyWindowsProcessMemory]::SetProcessInformation(
        $process.Handle,
        0,
        [ref]$memoryPriority,
        $memoryPrioritySize
      )) {
        throw "SetProcessInformation failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
      }
    }
    catch {
      Write-WatchdogLog "Could not reserve the $Name working set: $($_.Exception.Message)"
    }
  }
  Write-WatchdogLog "$Name started as PID $($process.Id)."
}

function Test-PublishlyProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EntryPoint
  )

  $match = Get-PublishlyProcess -EntryPoint $EntryPoint
  return $null -ne $match
}

try {
  Write-WatchdogLog 'Watchdog pass started.'

  if (-not (Test-LocalPort -Port 5433)) {
    if (-not (Test-Path -LiteralPath $postgresCtl -PathType Leaf)) {
      throw "Native PostgreSQL executable is missing: $postgresCtl"
    }
    if (-not (Test-Path -LiteralPath $postgresData -PathType Container)) {
      throw "Publishly PostgreSQL data directory is missing: $postgresData"
    }
    $postgresStart = Start-Process -FilePath $postgresCtl -ArgumentList @(
      'start', '-D', $postgresData, '-l', $postgresLog, '-w', '-t', '60'
    ) -WindowStyle Hidden -Wait -PassThru
    if ($postgresStart.ExitCode -ne 0) {
      throw "Native PostgreSQL failed to start with exit code $($postgresStart.ExitCode)."
    }
    Write-WatchdogLog 'Native PostgreSQL launch requested.'
  }

  if (-not (Test-LocalPort -Port 7233)) {
    if (-not (Test-Path -LiteralPath $temporalExecutable -PathType Leaf)) {
      throw "Temporal CLI executable is missing: $temporalExecutable"
    }
    $temporalProcess = Start-Process -FilePath $temporalExecutable -ArgumentList @(
      'server', 'start-dev',
      '--ip', '127.0.0.1',
      '--port', '7233',
      '--ui-port', '8233',
      '--db-filename', $temporalDatabase,
      '--ui-disable-news-fetch',
      '--log-level', 'warn'
    ) -WindowStyle Hidden -RedirectStandardOutput $temporalStdout -RedirectStandardError $temporalStderr -PassThru
    Write-WatchdogLog "Temporal started as PID $($temporalProcess.Id)."
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Seconds 2
      if (Test-LocalPort -Port 7233) { break }
    }
  }

  $redisReady = Ensure-LocalRedis
  $valkeyTask = Get-ScheduledTask -TaskName $valkeyTaskName -ErrorAction SilentlyContinue
  if (-not $valkeyTask) {
    throw 'class=user_action_needed code=valkey_keepalive_task_missing reason=The exact WSL transport owner is not registered. Run scripts/register-interim-watchdog.ps1.'
  }
  if ($valkeyTask.State -ne 'Running') {
    Start-ScheduledTask -TaskName $valkeyTaskName
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      if ((Get-ScheduledTask -TaskName $valkeyTaskName).State -eq 'Running') { break }
      Start-Sleep -Milliseconds 500
    }
  }
  if ((Get-ScheduledTask -TaskName $valkeyTaskName).State -ne 'Running') {
    throw 'class=recoverable code=valkey_keepalive_start_failed reason=The exact WSL transport owner did not reach Running state.'
  }
  Write-WatchdogLog 'class=success code=valkey_keepalive_running reason=The dedicated WSL transport owner is running.'
  $dependenciesReady =
    (Test-LocalPort -Port 5433) -and
    (Test-LocalPort -Port 7233) -and
    $redisReady
  if (-not $dependenciesReady) {
    Write-WatchdogLog 'class=recoverable code=runtime_dependency_unavailable reason=PostgreSQL, Temporal, or durable Redis is not ready; application launches will be retried on the next pass.'
  }

  foreach ($destination in @(
    (Join-Path $backendDirectory 'dist\data\bulk-scheduler-capabilities.json'),
    (Join-Path $orchestratorDirectory 'dist\data\bulk-scheduler-capabilities.json')
  )) {
    if (Test-Path -LiteralPath $capabilitySource -PathType Leaf) {
      $destinationDirectory = Split-Path -Parent $destination
      New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
      Copy-Item -LiteralPath $capabilitySource -Destination $destination -Force
    }
  }

  # The bridge intentionally runs the production build in non-strict mode
  # until official provider, billing, email, and object-storage credentials
  # have been issued. Production strictness is enforced on the VPS cutover.
  $env:NODE_ENV = 'development'
  $env:NODE_COMPILE_CACHE = $nodeCompileCache
  $env:FRONTEND_URL = 'https://publishlyapi.com'
  $env:MAIN_URL = 'https://publishlyapi.com'
  $env:NEXT_PUBLIC_SITE_URL = 'https://publishlyapi.com'
  $env:NEXT_PUBLIC_BACKEND_URL = 'https://publishlyapi.com/api'
  $env:BACKEND_INTERNAL_URL = 'http://localhost:3000'
  $hostEnvLines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in Get-Content -LiteralPath $hostEnvFile) { $hostEnvLines.Add($line) }
  $redisUrlIndex = -1
  for ($index = 0; $index -lt $hostEnvLines.Count; $index++) {
    if ($hostEnvLines[$index] -match '^REDIS_URL=') { $redisUrlIndex = $index; break }
  }
  $redisUrlLine = if ($redisUrlIndex -ge 0) { $hostEnvLines[$redisUrlIndex] } else { $null }
  if (-not $redisUrlLine -or $redisUrlLine -notmatch '^REDIS_URL=(redis://:[^@]+@)(?:127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}):6380$') {
    throw 'class=user_action_needed code=valkey_authenticated_url_missing reason=The restricted host environment does not contain the authenticated local Valkey URL. Run scripts/install-interim-valkey.ps1.'
  }
  $redisUrl = "$($Matches[1])$script:valkeyAddress`:6380"
  if ($redisUrlLine -ne "REDIS_URL=$redisUrl") {
    $hostEnvLines[$redisUrlIndex] = "REDIS_URL=$redisUrl"
    $temporaryHostEnv = "$hostEnvFile.publishly-new"
    [System.IO.File]::WriteAllText(
      $temporaryHostEnv,
      (($hostEnvLines -join "`r`n") + "`r`n"),
      [System.Text.UTF8Encoding]::new($false)
    )
    Move-Item -LiteralPath $temporaryHostEnv -Destination $hostEnvFile -Force
    Write-WatchdogLog 'class=recoverable code=valkey_address_refreshed reason=The restricted host environment was updated for the current private Ubuntu WSL address.'
  }
  $env:REDIS_URL = $redisUrl
  $env:REDIS_DISABLED = 'false'
  $env:PUBLISHLY_HOST_MODE = 'true'
  $env:TEMPORAL_ADDRESS = '127.0.0.1:7233'
  $env:WORKER_CONCURRENCY_DIVIDER = '16'
  $env:WORKER_DEFAULT_ACTIVITY_CONCURRENCY = '2'
  $env:WORKER_DEFAULT_WORKFLOW_CONCURRENCY = '2'
  $env:WORKER_ACTIVITY_POLLS = '1'
  $env:WORKER_WORKFLOW_POLLS = '2'
  $databaseUrlLine = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match '^DATABASE_URL=' } |
    Select-Object -First 1
  if ($databaseUrlLine) {
    $env:DATABASE_URL = $databaseUrlLine.Substring('DATABASE_URL='.Length).Trim().Trim('"') -replace '@localhost:5433/', '@127.0.0.1:5433/'
  }

  if ($dependenciesReady -and (Test-LocalPort -Port 3002) -and -not (Test-ServiceHealth -Name 'Orchestrator')) {
    Stop-UnhealthyPublishlyProcess -Name 'Orchestrator' -EntryPoint $orchestratorMain
  }

  if ($dependenciesReady -and (Test-LocalPort -Port 3000) -and -not (Test-ServiceHealth -Name 'Backend')) {
    Stop-UnhealthyPublishlyProcess -Name 'Backend' -EntryPoint $backendMain
  }

  if ((Test-LocalPort -Port 4200) -and -not (Test-ServiceHealth -Name 'Frontend')) {
    Stop-UnhealthyPublishlyProcess -Name 'Frontend' -EntryPoint $nextCli
  }

  if ($dependenciesReady -and -not (Test-LocalPort -Port 3002)) {
    if (-not (Test-Path -LiteralPath $orchestratorMain -PathType Leaf)) {
      Write-WatchdogLog 'Orchestrator build is missing; not launching it.'
    }
    elseif (Test-PublishlyProcess -EntryPoint $orchestratorMain) {
      Write-WatchdogLog 'Orchestrator startup is already in progress.'
    }
    elseif (Get-ScheduledTask -TaskName $orchestratorTaskName -ErrorAction SilentlyContinue) {
      Start-ScheduledTask -TaskName $orchestratorTaskName
      Write-WatchdogLog 'Dedicated orchestrator task start requested.'
    }
    else {
      Start-PublishlyProcess -Name 'Orchestrator' -FilePath $node -ArgumentList @("--env-file=$envFile", "--env-file=$hostEnvFile", '--experimental-require-module', $orchestratorMain) -WorkingDirectory $orchestratorDirectory
    }
  }

  if ($dependenciesReady -and -not (Test-LocalPort -Port 3000)) {
    if (-not (Test-Path -LiteralPath $backendMain -PathType Leaf)) {
      Write-WatchdogLog 'Backend build is missing; not launching it.'
    }
    elseif (Test-PublishlyProcess -EntryPoint $backendMain) {
      Write-WatchdogLog 'Backend startup is already in progress.'
    }
    else {
      Start-PublishlyProcess -Name 'Backend' -FilePath $node -ArgumentList @("--env-file=$envFile", "--env-file=$hostEnvFile", '--experimental-require-module', $backendMain) -WorkingDirectory $backendDirectory
    }
  }

  if (-not (Test-LocalPort -Port 4200)) {
    if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory '.next\BUILD_ID') -PathType Leaf)) {
      Write-WatchdogLog 'Frontend production build is missing; not launching it.'
    }
    else {
      Start-PublishlyProcess -Name 'Frontend' -FilePath $node -ArgumentList @($nextCli, 'start', '-p', '4200') -WorkingDirectory $frontendDirectory
    }
  }

  # This host can need three to five minutes to import the production runtime.
  # All processes launch concurrently and share one deadline so a later broken
  # service cannot multiply the watchdog's bounded recovery window.
  $applicationHealthDeadline = [DateTimeOffset]::Now.AddMinutes(6)
  if ($dependenciesReady -and -not (Wait-ServiceHealth -Name 'Backend' -Deadline $applicationHealthDeadline)) {
    throw 'class=recoverable code=backend_semantic_health_failed reason=The backend did not prove database and Redis health after bounded recovery.'
  }
  if ($dependenciesReady -and -not (Wait-ServiceHealth -Name 'Orchestrator' -Deadline $applicationHealthDeadline)) {
    throw 'class=recoverable code=orchestrator_semantic_health_failed reason=The orchestrator did not prove Temporal and publishing-engine heartbeat health after bounded recovery.'
  }
  if (-not (Wait-ServiceHealth -Name 'Frontend' -Deadline $applicationHealthDeadline)) {
    throw 'class=recoverable code=frontend_semantic_health_failed reason=The frontend did not return HTTP 200 after bounded recovery.'
  }

  $tunnelRunning = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*publishly-preview.yml*' } |
    Select-Object -First 1

  if (-not $tunnelRunning) {
    if (-not (Test-Path -LiteralPath $cloudflaredConfig -PathType Leaf)) {
      Write-WatchdogLog 'Cloudflare tunnel configuration is missing; not launching cloudflared.'
    }
    else {
      Start-PublishlyProcess -Name 'Cloudflare tunnel' -FilePath $cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--config', $cloudflaredConfig, 'run') -WorkingDirectory (Split-Path -Parent $cloudflaredConfig)
    }
  }

  $ports = @(5433, 7233, 3000, 3002, 4200) | ForEach-Object {
    '{0}={1}' -f $_, (Test-LocalPort -Port $_)
  }
  Write-WatchdogLog "Local ports: $($ports -join ', ')."
  Write-WatchdogLog 'class=success code=local_semantic_health_verified reason=Backend database/Redis, orchestrator Temporal/heartbeat, and frontend HTTP checks all passed.'

  try {
    $publicHealth = Invoke-WebRequest -UseBasicParsing -Uri 'https://publishlyapi.com/api/health' -TimeoutSec 15
    Write-WatchdogLog "Public API health returned HTTP $($publicHealth.StatusCode)."
  }
  catch {
    Write-WatchdogLog "Public API health is not ready: $($_.Exception.Message)"
  }
}
catch {
  $failureLocation = (([string]$_.InvocationInfo.PositionMessage) -replace '[\r\n]+', ' ').Trim()
  $failureStack = (([string]$_.ScriptStackTrace) -replace '[\r\n]+', ' | ').Trim()
  Write-WatchdogLog "class=final_failure code=watchdog_pass_failed reason=$($_.Exception.Message) location=$failureLocation stack=$failureStack"
  exit 1
}
finally {
  if ($createdNew) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
