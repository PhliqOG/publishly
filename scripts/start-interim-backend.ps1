[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$node = Join-Path $stateDirectory 'Node22\node-v22.12.0-win-x64\node.exe'
$main = Join-Path $repoRoot 'apps\backend\dist\apps\backend\src\main.js'
$envFile = Join-Path $repoRoot '.env'
$hostEnvFile = Join-Path $stateDirectory 'publishly-host.env'

foreach ($requiredFile in @($node, $main, $envFile, $hostEnvFile)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required interim backend file is missing: $requiredFile"
  }
}

if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 3000 already has a listener; refusing to start a duplicate backend.'
}

$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" `
  -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($main, [StringComparison]::OrdinalIgnoreCase) -ge 0
  } |
  Select-Object -First 1
if ($existing) {
  throw "Publishly backend startup is already in progress as PID $($existing.ProcessId)."
}

$env:NODE_ENV = 'development'
$env:NODE_COMPILE_CACHE = Join-Path $stateDirectory 'NodeCompileCache'
$env:FRONTEND_URL = 'https://publishlyapi.com'
$env:MAIN_URL = 'https://publishlyapi.com'
$env:NEXT_PUBLIC_SITE_URL = 'https://publishlyapi.com'
$env:NEXT_PUBLIC_BACKEND_URL = 'https://publishlyapi.com/api'
$env:BACKEND_INTERNAL_URL = 'http://localhost:3000'
$redisUrlLine = Get-Content -LiteralPath $hostEnvFile |
  Where-Object { $_ -match '^REDIS_URL=' } |
  Select-Object -First 1
if (-not $redisUrlLine -or $redisUrlLine -notmatch '^REDIS_URL=redis://:[^@]+@\d{1,3}(?:\.\d{1,3}){3}:6380$') {
  throw 'The restricted host environment does not contain the authenticated local Valkey URL. Run scripts/install-interim-valkey.ps1.'
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
  throw "The private durable Valkey endpoint is not ready: $($_.Exception.Message)"
}
finally {
  $redisProbe.Dispose()
}
$env:REDIS_URL = $redisUrl.AbsoluteUri
$env:REDIS_DISABLED = 'false'
$redisMode = 'authenticated durable Valkey'
$env:PUBLISHLY_HOST_MODE = 'true'
$env:TEMPORAL_ADDRESS = '127.0.0.1:7233'

$databaseUrlLine = Get-Content -LiteralPath $envFile |
  Where-Object { $_ -match '^DATABASE_URL=' } |
  Select-Object -First 1
if ($databaseUrlLine) {
  $env:DATABASE_URL = $databaseUrlLine.Substring('DATABASE_URL='.Length).
    Trim().Trim('"') -replace '@localhost:5433/', '@127.0.0.1:5433/'
}

$process = Start-Process -FilePath $node -ArgumentList @(
  "--env-file=$envFile",
  "--env-file=$hostEnvFile",
  '--experimental-require-module',
  $main
) -WorkingDirectory (Join-Path $repoRoot 'apps\backend') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $stateDirectory 'backend-recovery.stdout.log') `
  -RedirectStandardError (Join-Path $stateDirectory 'backend-recovery.stderr.log') `
  -PassThru

[pscustomobject]@{
  Pid = $process.Id
  EntryPoint = $main
  RedisMode = $redisMode
}
