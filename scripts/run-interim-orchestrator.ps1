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

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$node = Join-Path $stateDirectory 'Node22\node-v22.12.0-win-x64\node.exe'
$envFile = Join-Path $repoRoot '.env'
$hostEnvFile = Join-Path $stateDirectory 'publishly-host.env'
$orchestratorMain = Join-Path $repoRoot 'apps\orchestrator\dist\apps\orchestrator\src\main.js'
$logDirectory = $stateDirectory
$stdout = Join-Path $logDirectory 'orchestrator.stdout.log'
$stderr = Join-Path $logDirectory 'orchestrator.stderr.log'

foreach ($requiredFile in @($node, $envFile, $hostEnvFile, $orchestratorMain)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Publishly orchestrator runtime file is missing: $requiredFile"
  }
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$env:NODE_ENV = 'development'
$env:NODE_COMPILE_CACHE = Join-Path $stateDirectory 'NodeCompileCache\orchestrator'
New-Item -ItemType Directory -Path $env:NODE_COMPILE_CACHE -Force | Out-Null
$redisUrlLine = Get-Content -LiteralPath $hostEnvFile |
  Where-Object { $_ -match '^REDIS_URL=' } |
  Select-Object -First 1
if (-not $redisUrlLine -or $redisUrlLine -notmatch '^REDIS_URL=redis://:[^@]+@\d{1,3}(?:\.\d{1,3}){3}:6380$') {
  throw 'class=user_action_needed code=valkey_authenticated_url_missing reason=The restricted host environment does not contain the authenticated local Valkey URL. Run scripts/install-interim-valkey.ps1.'
}
$redisUrl = [Uri]$redisUrlLine.Substring('REDIS_URL='.Length)
$redisProbe = [System.Net.Sockets.TcpClient]::new()
try {
  $redisConnect = $redisProbe.BeginConnect($redisUrl.Host, $redisUrl.Port, $null, $null)
  if (-not $redisConnect.AsyncWaitHandle.WaitOne(3000)) {
    throw 'Durable Valkey timed out.'
  }
  $redisProbe.EndConnect($redisConnect)
}
catch {
  throw "class=recoverable code=redis_not_ready reason=The orchestrator will not start without the private durable Valkey endpoint: $($_.Exception.Message)"
}
finally {
  $redisProbe.Dispose()
}
$env:REDIS_URL = $redisUrl.AbsoluteUri
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

Add-Content -LiteralPath $stdout -Value (
  '{0} Dedicated orchestrator task started.' -f ([DateTimeOffset]::Now.ToString('o'))
) -Encoding UTF8

# Keep this task process alive for the entire worker lifetime. Start-Process
# avoids Windows PowerShell 5 converting normal native stderr diagnostics into
# PowerShell ErrorRecord objects.
$orchestrator = Start-Process -FilePath $node -ArgumentList @(
  "--env-file=$envFile",
  "--env-file=$hostEnvFile",
  '--experimental-require-module',
  $orchestratorMain
) -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

# Windows aggressively trims background scheduled-task children under memory
# pressure. Keep enough of the worker resident for its health socket and
# Temporal callbacks to remain responsive; this is not used on the VPS.
try {
  $orchestrator.PriorityClass = 'AboveNormal'
  $orchestrator.MaxWorkingSet = [IntPtr](2GB)
  $orchestrator.MinWorkingSet = [IntPtr](256MB)
  $memoryPriority = New-Object PublishlyWindowsProcessMemory+PriorityInformation
  $memoryPriority.MemoryPriority = 5
  $memoryPrioritySize = [Runtime.InteropServices.Marshal]::SizeOf($memoryPriority)
  if (-not [PublishlyWindowsProcessMemory]::SetProcessInformation(
    $orchestrator.Handle,
    0,
    [ref]$memoryPriority,
    $memoryPrioritySize
  )) {
    throw "SetProcessInformation failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
  }
}
catch {
  Add-Content -LiteralPath $stderr -Value (
    '{0} Could not reserve the worker working set: {1}' -f ([DateTimeOffset]::Now.ToString('o')), $_.Exception.Message
  ) -Encoding UTF8
}

$orchestrator.WaitForExit()

exit $orchestrator.ExitCode
