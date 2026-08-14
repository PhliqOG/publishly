[CmdletBinding()]
param(
  [switch]$RotateSecret
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$distribution = 'Ubuntu'
$unitName = 'publishly-valkey.service'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'Publishly'
$hostEnvFile = Join-Path $stateDirectory 'publishly-host.env'

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

function Invoke-Wsl {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [switch]$AllowFailure
  )

  # Windows PowerShell 5 promotes ordinary native stderr into ErrorRecord
  # objects when the script-wide preference is Stop. Capture it as command
  # output here so -AllowFailure can inspect expected nonzero probes.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & wsl.exe -d $distribution -- @ArgumentList 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "WSL command failed with exit code ${exitCode}: $([string]::Join(' ', $ArgumentList))`n$($output -join "`n")"
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = @($output)
  }
}

function Write-WslRootFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Contents,
    [ValidateSet('0600', '0644')]
    [string]$Mode = '0600'
  )

  $temporary = "$Path.publishly-new"
  $input = "$temporary.input"
  $normalizedContents = $Contents.Replace("`r`n", "`n")
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'wsl.exe'
  # Windows PowerShell 5 emits an UTF-8 preamble when its redirected stdin
  # writer is first opened. Strip that preamble inside Linux before the atomic
  # install; systemd rejects a BOM-prefixed environment variable or unit name.
  $startInfo.Arguments = "-d $distribution -- sh -c `"umask 077; cat > '$input' && sed '1s/^\\xEF\\xBB\\xBF//' '$input' > '$temporary' && rm -f '$input' && chmod '$Mode' '$temporary' && mv '$temporary' '$Path'`""
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) {
      throw "Could not start WSL while provisioning $Path."
    }
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($normalizedContents)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
      throw "Could not atomically provision $Path in WSL: $stderr$stdout"
    }
  }
  finally {
    $process.Dispose()
  }
}

function New-ValkeySecret {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-HostEnvironmentValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [System.Collections.Generic.List[string]]$Lines
  )

  $prefix = "$Name="
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if ($Lines[$index].StartsWith($prefix, [System.StringComparison]::Ordinal)) {
      $Lines[$index] = "$prefix$Value"
      return
    }
  }
  $Lines.Add("$prefix$Value")
}

function Test-AuthenticatedValkey {
  param(
    [Parameter(Mandatory = $true)][string]$Password,
    [Parameter(Mandatory = $true)][string]$Address
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.BeginConnect($Address, 6380, $null, $null)
    if (-not $connection.AsyncWaitHandle.WaitOne(5000)) {
      throw 'Windows localhost could not reach the WSL Valkey service within five seconds.'
    }
    $client.EndConnect($connection)
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $writer = [System.IO.StreamWriter]::new($stream, [System.Text.Encoding]::ASCII, 1024, $true)
    $writer.NewLine = "`r`n"
    $writer.AutoFlush = $true
    $writer.Write("*1`r`n`$4`r`nPING`r`n")
    if ($reader.ReadLine() -notmatch '^-NOAUTH') {
      throw 'Valkey accepted an unauthenticated PING; the generated password is not enforced.'
    }
    $writer.Write("*2`r`n`$4`r`nAUTH`r`n`$$($Password.Length)`r`n$Password`r`n")
    if ($reader.ReadLine() -ne '+OK') {
      throw 'Valkey rejected the generated Publishly password.'
    }
    $writer.Write("*1`r`n`$4`r`nPING`r`n")
    if ($reader.ReadLine() -ne '+PONG') {
      throw 'Authenticated Valkey PING did not return PONG.'
    }
    $writer.Dispose()
    $reader.Dispose()
  }
  finally {
    $client.Dispose()
  }
}

$package = Invoke-Wsl -ArgumentList @('dpkg-query', '-W', 'valkey-server') -AllowFailure
if ($package.ExitCode -ne 0) {
  Invoke-Wsl -ArgumentList @('apt-get', 'update', '-qq') | Out-Null
  Invoke-Wsl -ArgumentList @('env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', 'valkey-server') | Out-Null
}

# The package's default unit is not used; Publishly owns an authenticated,
# isolated port and state directory.
Invoke-Wsl -ArgumentList @('systemctl', 'disable', '--now', 'valkey-server.service') -AllowFailure | Out-Null

$existingSecret = Invoke-Wsl -ArgumentList @(
  'sh', '-c',
  "test -r /etc/publishly-valkey.env && sed -n 's/^PUBLISHLY_VALKEY_PASSWORD=//p' /etc/publishly-valkey.env"
) -AllowFailure
$secret = ($existingSecret.Output | Select-Object -First 1)
if ($RotateSecret -or -not $secret -or $secret -notmatch '^[A-Za-z0-9_-]{64}$') {
  $secret = New-ValkeySecret
}

Write-WslRootFile -Path '/etc/publishly-valkey.env' -Contents "PUBLISHLY_VALKEY_PASSWORD=$secret`n" -Mode '0600'

$unit = @'
[Unit]
Description=Publishly interim durable Valkey
After=network.target

[Service]
Type=simple
User=valkey
Group=valkey
EnvironmentFile=/etc/publishly-valkey.env
RuntimeDirectory=publishly-valkey
StateDirectory=publishly-valkey
ExecStart=/usr/bin/valkey-server --bind 0.0.0.0 --port 6380 --protected-mode yes --requirepass ${PUBLISHLY_VALKEY_PASSWORD} --appendonly yes --appenddirname appendonlydir --dir /var/lib/publishly-valkey --pidfile /run/publishly-valkey/valkey.pid --daemonize no --logfile ""
Restart=always
RestartSec=2
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=true

[Install]
WantedBy=multi-user.target
'@
Write-WslRootFile -Path "/etc/systemd/system/$unitName" -Contents $unit -Mode '0644'
Invoke-Wsl -ArgumentList @('systemctl', 'daemon-reload') | Out-Null
Invoke-Wsl -ArgumentList @('systemctl', 'enable', '--now', $unitName) | Out-Null
Invoke-Wsl -ArgumentList @('systemctl', 'restart', $unitName) | Out-Null

$addressResult = Invoke-Wsl -ArgumentList @('hostname', '-I')
$wslAddress = ([string]($addressResult.Output -join ' ') -split '\s+' |
  Where-Object { $_ -match '^\d{1,3}(?:\.\d{1,3}){3}$' } |
  Select-Object -First 1)
$parsedAddress = $null
if (
  -not [System.Net.IPAddress]::TryParse($wslAddress, [ref]$parsedAddress) -or
  $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork
) {
  throw 'Could not resolve the private Ubuntu WSL IPv4 address for Valkey.'
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    Test-AuthenticatedValkey -Password $secret -Address $wslAddress
    $ready = $true
    break
  }
  catch {
    $ready = $false
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) {
  $status = Invoke-Wsl -ArgumentList @('systemctl', 'status', $unitName, '--no-pager') -AllowFailure
  throw "Publishly Valkey did not pass authenticated private-endpoint health.`n$($status.Output -join "`n")"
}

$lines = [System.Collections.Generic.List[string]]::new()
if (Test-Path -LiteralPath $hostEnvFile) {
  foreach ($line in Get-Content -LiteralPath $hostEnvFile) { $lines.Add($line) }
}
$encodedSecret = [Uri]::EscapeDataString($secret)
Set-HostEnvironmentValue -Name 'REDIS_URL' -Value "redis://:$encodedSecret@$wslAddress`:6380" -Lines $lines
Set-HostEnvironmentValue -Name 'REDIS_DISABLED' -Value 'false' -Lines $lines
$temporaryHostEnv = "$hostEnvFile.publishly-new"
[System.IO.File]::WriteAllText($temporaryHostEnv, (($lines -join "`r`n") + "`r`n"), [System.Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporaryHostEnv -Destination $hostEnvFile -Force

Write-Output 'Publishly Valkey is installed, authenticated, persistent, and verified on its private Ubuntu WSL endpoint.'
