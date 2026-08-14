[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateRoot,
  [ValidateRange(1024, 65535)]
  [int]$Port = 3001,
  [ValidateRange(30, 1800)]
  [int]$StartupTimeoutSeconds = 720
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$node = Join-Path $stateDirectory 'Node22\node-v22.12.0-win-x64\node.exe'
$candidateMain = Join-Path $CandidateRoot 'apps\backend\src\main.js'
$envFile = Join-Path $repoRoot '.env'
$hostEnvFile = Join-Path $stateDirectory 'publishly-host.env'
$stdout = Join-Path $stateDirectory 'backend-candidate.stdout.log'
$stderr = Join-Path $stateDirectory 'backend-candidate.stderr.log'

foreach ($requiredFile in @($node, $candidateMain, $envFile, $hostEnvFile)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required release-candidate file is missing: $requiredFile"
  }
}

$env:NODE_ENV = 'development'
$env:PORT = [string]$Port
$env:NODE_COMPILE_CACHE = Join-Path $stateDirectory 'NodeCompileCache'
$env:FRONTEND_URL = 'https://publishlyapi.com'
$env:MAIN_URL = 'https://publishlyapi.com'
$env:NEXT_PUBLIC_SITE_URL = 'https://publishlyapi.com'
$env:NEXT_PUBLIC_BACKEND_URL = 'https://publishlyapi.com/api'
$env:BACKEND_INTERNAL_URL = "http://127.0.0.1:$Port"
$env:REDIS_DISABLED = 'true'
$env:PUBLISHLY_HOST_MODE = 'true'
$env:TEMPORAL_ADDRESS = '127.0.0.1:7233'

$databaseUrlLine = Get-Content -LiteralPath $envFile |
  Where-Object { $_ -match '^DATABASE_URL=' } |
  Select-Object -First 1
if ($databaseUrlLine) {
  $env:DATABASE_URL = $databaseUrlLine.Substring('DATABASE_URL='.Length).
    Trim().Trim('"') -replace '@localhost:5433/', '@127.0.0.1:5433/'
}

$candidateProcess = $null
try {
  $candidateProcess = Start-Process -FilePath $node -ArgumentList @(
    "--env-file=$envFile",
    "--env-file=$hostEnvFile",
    '--experimental-require-module',
    $candidateMain
  ) -WorkingDirectory (Join-Path $repoRoot 'apps\backend') -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

  $health = $null
  $attempts = [math]::Ceiling($StartupTimeoutSeconds / 2)
  for ($attempt = 0; $attempt -lt $attempts; $attempt++) {
    Start-Sleep -Seconds 2
    if ($candidateProcess.HasExited) {
      break
    }
    try {
      $health = Invoke-WebRequest -UseBasicParsing `
        -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
      if ($health.StatusCode -eq 200) {
        break
      }
    }
    catch {
      $health = $null
    }
  }

  if (-not $health -or $health.StatusCode -ne 200) {
    throw "Candidate backend did not become healthy. Review $stdout and $stderr."
  }

  [pscustomobject]@{
    Pid = $candidateProcess.Id
    Status = $health.StatusCode
    Body = $health.Content
    CandidateMainSha256 = (Get-FileHash -LiteralPath $candidateMain -Algorithm SHA256).Hash
  }
}
finally {
  if ($candidateProcess -and -not $candidateProcess.HasExited) {
    Stop-Process -Id $candidateProcess.Id -Force
    $candidateProcess.WaitForExit(10000) | Out-Null
  }
}
