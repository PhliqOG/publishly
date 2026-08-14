[CmdletBinding()]
param(
  [string]$TokenFile = (Join-Path $env:LOCALAPPDATA 'Publishly\hcloud.token'),
  [string]$SshPublicKey = (Join-Path $env:USERPROFILE '.ssh\publishly_vps_ed25519.pub'),
  [string]$ServerName = 'publishly-production',
  [string]$ServerType = 'cx43',
  [string]$Location = 'nbg1',
  [decimal]$MaximumMonthlyPrice = 40
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($requiredFile in @($TokenFile, $SshPublicKey)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required provisioning file is missing: $requiredFile"
  }
}
$token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
if ($token.Length -lt 32 -or $token -match '\s') {
  throw 'The Hetzner Cloud token file does not contain one usable token.'
}
$headers = @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
}
$apiBase = 'https://api.hetzner.cloud/v1'

function Invoke-HetznerApi {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body
  )
  $parameters = @{
    Uri = "$apiBase$Path"
    Headers = $headers
    Method = $Method
  }
  if ($null -ne $Body) {
    $parameters.Body = $Body | ConvertTo-Json -Depth 12 -Compress
  }
  try {
    return Invoke-RestMethod @parameters
  }
  catch {
    $status = if ($_.Exception.Response) {
      [int]$_.Exception.Response.StatusCode
    } else { 0 }
    throw "Hetzner API $Method $Path failed (HTTP $status)."
  }
}

$encodedServerName = [Uri]::EscapeDataString($ServerName)
$servers = (Invoke-HetznerApi -Method GET -Path "/servers?name=$encodedServerName").servers
$matchingServers = @($servers | Where-Object { $_.name -eq $ServerName })
if ($matchingServers.Count -gt 1) {
  throw "More than one Hetzner server is named $ServerName."
}

$pricing = (Invoke-HetznerApi -Method GET -Path '/pricing').pricing
$serverPricing = $pricing.server_types |
  Where-Object { $_.name -eq $ServerType } |
  Select-Object -First 1
$locationPrice = $serverPricing.prices |
  Where-Object { $_.location -eq $Location } |
  Select-Object -First 1
if (-not $locationPrice) {
  throw "$ServerType has no current price or availability entry for $Location."
}
$monthlyGross = [decimal]::Parse(
  [string]$locationPrice.price_monthly.gross,
  [Globalization.CultureInfo]::InvariantCulture
)
$monthlyWithBackups = [decimal]::Round($monthlyGross * 1.2, 2)
if ($monthlyWithBackups -gt $MaximumMonthlyPrice) {
  throw "The server plus Hetzner backups costs $monthlyWithBackups per month, above the $MaximumMonthlyPrice limit."
}

if ($matchingServers.Count -eq 1) {
  $server = $matchingServers[0]
  if (
    $server.labels.app -ne 'publishly' -or
    $server.labels.environment -ne 'production'
  ) {
    throw 'A same-named server exists without the expected Publishly production labels.'
  }
}
else {
  $publicKey = (Get-Content -LiteralPath $SshPublicKey -Raw).Trim()
  if ($publicKey -notmatch '^(?:ssh-ed25519|ssh-rsa)\s+[A-Za-z0-9+/=]+(?:\s+.*)?$') {
    throw 'The prepared Publishly SSH public key is invalid.'
  }
  $sshKeys = (Invoke-HetznerApi -Method GET -Path '/ssh_keys?name=publishly-vps').ssh_keys
  $matchingKeys = @($sshKeys | Where-Object { $_.name -eq 'publishly-vps' })
  if ($matchingKeys.Count -gt 1) { throw 'Duplicate publishly-vps SSH keys exist.' }
  if ($matchingKeys.Count -eq 1) {
    if ($matchingKeys[0].public_key.Trim() -ne $publicKey) {
      throw 'The existing publishly-vps SSH key does not match the prepared key.'
    }
    $sshKey = $matchingKeys[0]
  }
  else {
    $sshKey = (Invoke-HetznerApi -Method POST -Path '/ssh_keys' -Body @{
      name = 'publishly-vps'
      public_key = $publicKey
      labels = @{ app = 'publishly'; environment = 'production' }
    }).ssh_key
  }

  $firewalls = (Invoke-HetznerApi -Method GET -Path '/firewalls?name=publishly-production').firewalls
  $matchingFirewalls = @($firewalls | Where-Object { $_.name -eq 'publishly-production' })
  if ($matchingFirewalls.Count -gt 1) { throw 'Duplicate Publishly firewalls exist.' }
  if ($matchingFirewalls.Count -eq 1) {
    $firewall = $matchingFirewalls[0]
  }
  else {
    $firewall = (Invoke-HetznerApi -Method POST -Path '/firewalls' -Body @{
      name = 'publishly-production'
      labels = @{ app = 'publishly'; environment = 'production' }
      rules = @(
        @{
          direction = 'in'
          protocol = 'tcp'
          port = '22'
          source_ips = @('0.0.0.0/0', '::/0')
          description = 'SSH administration; web traffic uses Cloudflare Tunnel'
        }
      )
    }).firewall
  }

  $created = Invoke-HetznerApi -Method POST -Path '/servers' -Body @{
    name = $ServerName
    server_type = $ServerType
    image = 'ubuntu-24.04'
    location = $Location
    ssh_keys = @($sshKey.id)
    firewalls = @(@{ firewall = $firewall.id })
    backups = $true
    start_after_create = $true
    public_net = @{ enable_ipv4 = $true; enable_ipv6 = $true }
    labels = @{ app = 'publishly'; environment = 'production' }
  }
  $server = $created.server
}

$deadline = (Get-Date).AddMinutes(5)
do {
  $server = (Invoke-HetznerApi -Method GET -Path "/servers/$($server.id)").server
  if ($server.status -eq 'running' -and $server.public_net.ipv4.ip) { break }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
if ($server.status -ne 'running' -or -not $server.public_net.ipv4.ip) {
  throw 'The Hetzner server did not become running with a public IPv4 address.'
}

$statePath = Join-Path $env:LOCALAPPDATA 'Publishly\publishly-vps.json'
$state = [ordered]@{
  provider = 'hetzner'
  serverId = $server.id
  name = $server.name
  ipv4 = $server.public_net.ipv4.ip
  ipv6 = $server.public_net.ipv6.ip
  serverType = $server.server_type.name
  location = $server.datacenter.location.name
  monthlyGross = [string]$monthlyGross
  monthlyWithBackups = [string]$monthlyWithBackups
  currency = $pricing.currency
  provisionedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText(
  $statePath,
  ($state | ConvertTo-Json -Depth 4),
  $utf8WithoutBom
)

[pscustomobject]@{
  ServerId = $server.id
  Status = $server.status
  IPv4 = $server.public_net.ipv4.ip
  ServerType = $server.server_type.name
  Location = $server.datacenter.location.name
  MonthlyWithBackups = $monthlyWithBackups
  Currency = $pricing.currency
  StateFile = $statePath
  SecretValuesPrinted = $false
}
