[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 4201,

  [ValidatePattern('^\.next-[A-Za-z0-9._-]+$')]
  [string]$DistDirectory = '.next-candidate'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendDirectory = Join-Path $repoRoot 'apps\frontend'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$node = Join-Path $stateDirectory 'Node22\node-v22.12.0-win-x64\node.exe'
$nextCli = Join-Path $repoRoot 'node_modules\next\dist\bin\next'
$buildId = Join-Path (Join-Path $frontendDirectory $DistDirectory) 'BUILD_ID'

foreach ($requiredFile in @($node, $nextCli, $buildId)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Frontend release-candidate file is missing: $requiredFile"
  }
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$env:NODE_ENV = 'production'
$env:NODE_COMPILE_CACHE = Join-Path $stateDirectory 'NodeCompileCache\frontend-candidate'
$env:PUBLISHLY_NEXT_DIST_DIR = $DistDirectory
$env:FRONTEND_URL = 'https://publishlyapi.com'
$env:MAIN_URL = 'https://publishlyapi.com'
$env:NEXT_PUBLIC_SITE_URL = 'https://publishlyapi.com'
$env:NEXT_PUBLIC_BACKEND_URL = 'https://publishlyapi.com/api'
$env:BACKEND_INTERNAL_URL = 'http://127.0.0.1:3000'
$env:STORAGE_PROVIDER = 'local'

$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like "*next*start*-p*$Port*"
  } |
  Select-Object -First 1
if ($existing) {
  throw "A Node process is already serving candidate port $Port as PID $($existing.ProcessId)."
}

$process = Start-Process -FilePath $node -ArgumentList @(
  $nextCli,
  'start',
  '-p',
  [string]$Port
) -WorkingDirectory $frontendDirectory -WindowStyle Hidden -RedirectStandardOutput (
  Join-Path $stateDirectory 'frontend-candidate.stdout.log'
) -RedirectStandardError (
  Join-Path $stateDirectory 'frontend-candidate.stderr.log'
) -PassThru

[PSCustomObject]@{
  ProcessId = $process.Id
  Port = $Port
  DistDirectory = $DistDirectory
  BuildId = Get-Content -LiteralPath $buildId -Raw
}
