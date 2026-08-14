[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$stdout = Join-Path $stateDirectory 'valkey-keepalive.stdout.log'
$stderr = Join-Path $stateDirectory 'valkey-keepalive.stderr.log'

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

$status = Start-Process -FilePath 'wsl.exe' -ArgumentList @(
  '-d', 'Ubuntu', '--', 'systemctl', 'is-active', 'publishly-valkey.service'
) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr
if ($status.ExitCode -ne 0) {
  throw 'class=recoverable code=valkey_service_inactive reason=The WSL keepalive will not start while publishly-valkey.service is inactive.'
}

Add-Content -LiteralPath $stdout -Value (
  '{0} Publishly WSL Valkey keepalive started.' -f ([DateTimeOffset]::Now.ToString('o'))
) -Encoding UTF8

$keepalive = Start-Process -FilePath 'wsl.exe' -ArgumentList @(
  '-d', 'Ubuntu', '--', '/usr/bin/sleep', 'infinity'
) -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr
$keepalive.WaitForExit()

Add-Content -LiteralPath $stderr -Value (
  '{0} class=recoverable code=valkey_keepalive_exited reason=The exact WSL keepalive exited with code {1}.' -f ([DateTimeOffset]::Now.ToString('o')), $keepalive.ExitCode
) -Encoding UTF8
exit $keepalive.ExitCode
