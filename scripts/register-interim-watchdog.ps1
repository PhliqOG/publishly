[CmdletBinding()]
param(
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$watchdog = Join-Path $PSScriptRoot 'interim-windows-watchdog.ps1'
$orchestratorLauncher = Join-Path $PSScriptRoot 'run-interim-orchestrator.ps1'
$valkeyLauncher = Join-Path $PSScriptRoot 'run-interim-valkey-keepalive.ps1'
$recurringTask = 'Publishly Interim Uptime'
$orchestratorTask = 'Publishly Interim Orchestrator'
$valkeyTask = 'Publishly Interim Valkey Keepalive'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runValueName = 'PublishlyInterimUptime'

if ($Remove) {
  & schtasks.exe /Delete /TN $recurringTask /F 2>$null | Out-Null
  & schtasks.exe /Delete /TN $orchestratorTask /F 2>$null | Out-Null
  & schtasks.exe /Delete /TN $valkeyTask /F 2>$null | Out-Null
  if (Test-Path -LiteralPath $runKey) {
    Remove-ItemProperty -LiteralPath $runKey -Name $runValueName -ErrorAction SilentlyContinue
  }
  Write-Output 'Publishly interim watchdog schedule and logon launcher removed.'
  exit 0
}

foreach ($launcher in @($watchdog, $orchestratorLauncher, $valkeyLauncher)) {
  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "Publishly launcher script is missing: $launcher"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$node = Join-Path $env:LOCALAPPDATA 'Publishly\Node22\node-v22.12.0-win-x64\node.exe'
$envFile = Join-Path $repoRoot '.env'
$hostEnvFile = Join-Path $env:LOCALAPPDATA 'Publishly\publishly-host.env'
$orchestratorMain = Join-Path $repoRoot 'apps\orchestrator\dist\apps\orchestrator\src\main.js'
foreach ($requiredFile in @($node, $envFile, $hostEnvFile, $orchestratorMain)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Publishly runtime file is missing: $requiredFile"
  }
}

$powershell = Join-Path $PSHOME 'powershell.exe'
$taskCommand = "`"$powershell`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdog`""

& schtasks.exe /Create /TN $recurringTask /TR $taskCommand /SC MINUTE /MO 5 /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Could not register the recurring Publishly watchdog task.'
}

$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -StartWhenAvailable
Set-ScheduledTask -TaskName $recurringTask -Settings $taskSettings | Out-Null

$orchestratorCommand = "`"$powershell`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$orchestratorLauncher`""
& schtasks.exe /Create /TN $orchestratorTask /TR $orchestratorCommand /SC ONCE /ST 23:59 /SD 12/31/2099 /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Could not register the dedicated Publishly orchestrator task.'
}
$orchestratorSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable
Set-ScheduledTask -TaskName $orchestratorTask -Settings $orchestratorSettings | Out-Null

$valkeyCommand = "`"$powershell`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$valkeyLauncher`""
& schtasks.exe /Create /TN $valkeyTask /TR $valkeyCommand /SC ONCE /ST 23:59 /SD 12/31/2099 /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Could not register the dedicated Publishly Valkey keepalive task.'
}
$valkeySettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable
Set-ScheduledTask -TaskName $valkeyTask -Settings $valkeySettings | Out-Null

New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name $runValueName -Value $taskCommand -PropertyType String -Force | Out-Null

$valkeyState = (Get-ScheduledTask -TaskName $valkeyTask -ErrorAction SilentlyContinue).State
if ($valkeyState -ne 'Running') {
  & schtasks.exe /Run /TN $valkeyTask | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'The Valkey keepalive task was registered, but its initial run could not be started.'
  }
}

& schtasks.exe /Run /TN $recurringTask | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Watchdog tasks were registered, but the initial run could not be started.'
}

$orchestratorRunning = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf($orchestratorMain, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  } |
  Select-Object -First 1
if (-not $orchestratorRunning) {
  & schtasks.exe /Run /TN $orchestratorTask | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'The orchestrator task was registered, but its initial run could not be started.'
  }
}

Write-Output 'Publishly interim watchdog, orchestrator, and Valkey keepalive tasks registered and started.'
