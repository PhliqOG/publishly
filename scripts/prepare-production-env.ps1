[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:LOCALAPPDATA 'Publishly\publishly.production.env'),

  [ValidatePattern('^[a-fA-F0-9]{32}$')]
  [string]$CloudflareAccountId = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$template = Join-Path $repoRoot '.env.production.example'
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
$repoPrefix = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) +
  [System.IO.Path]::DirectorySeparatorChar

if (-not (Test-Path -LiteralPath $template -PathType Leaf)) {
  throw "Production environment template is missing: $template"
}
if ($resolvedDestination.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The production environment contains secrets and must be created outside the repository.'
}
if (Test-Path -LiteralPath $resolvedDestination) {
  throw "Refusing to overwrite the existing production environment: $resolvedDestination"
}

function New-RandomHex {
  param([Parameter(Mandatory = $true)][ValidateRange(16, 256)][int]$Bytes)

  $buffer = New-Object byte[] $Bytes
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  }
  finally {
    $generator.Dispose()
  }
  return ([BitConverter]::ToString($buffer) -replace '-', '').ToLowerInvariant()
}

function New-RandomBase64Url {
  param([Parameter(Mandatory = $true)][ValidateRange(32, 256)][int]$Bytes)

  $buffer = New-Object byte[] $Bytes
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  }
  finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$lines = [Collections.Generic.List[string]]::new()
Get-Content -LiteralPath $template | ForEach-Object { $lines.Add($_) }

function Set-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $matchIndexes = @()
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match ('^{0}=' -f [regex]::Escape($Name))) {
      $matchIndexes += $index
    }
  }
  if ($matchIndexes.Count -ne 1) {
    throw "Expected exactly one $Name entry in the production template; found $($matchIndexes.Count)."
  }
  $lines[$matchIndexes[0]] = "$Name=$Value"
}

$databasePassword = New-RandomHex -Bytes 32
$temporalDatabasePassword = New-RandomHex -Bytes 32
Set-EnvironmentValue -Name 'DATABASE_PASSWORD' -Value $databasePassword
Set-EnvironmentValue -Name 'TEMPORAL_DATABASE_PASSWORD' -Value $temporalDatabasePassword
Set-EnvironmentValue -Name 'DATABASE_URL' -Value (
  "postgresql://publishly:$databasePassword@postgres:5432/publishly"
)
Set-EnvironmentValue -Name 'JWT_SECRET' -Value (New-RandomBase64Url -Bytes 64)
Set-EnvironmentValue -Name 'ENCRYPTION_SECRET' -Value (New-RandomBase64Url -Bytes 64)
Set-EnvironmentValue -Name 'BULK_PRIVATE_INTERNAL_TOKEN' -Value (New-RandomBase64Url -Bytes 48)
Set-EnvironmentValue -Name 'META_WEBHOOK_VERIFY_TOKEN' -Value (New-RandomBase64Url -Bytes 48)

if ($CloudflareAccountId) {
  $r2Endpoint = "https://$CloudflareAccountId.r2.cloudflarestorage.com"
  Set-EnvironmentValue -Name 'S3_ENDPOINT' -Value $r2Endpoint
  Set-EnvironmentValue -Name 'BULK_PRIVATE_S3_ENDPOINT' -Value $r2Endpoint
}

$destinationDirectory = Split-Path -Parent $resolvedDestination
New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllLines($resolvedDestination, $lines, $utf8WithoutBom)

# Remove inherited access and grant only the current Windows identity. The VPS
# deployer later uploads the file as an operator-only secret with mode 0600.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule(
  $identity,
  [Security.AccessControl.FileSystemRights]::FullControl,
  [Security.AccessControl.AccessControlType]::Allow
)
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $resolvedDestination -AclObject $acl

[PSCustomObject]@{
  Destination = $resolvedDestination
  GeneratedSecrets = @(
    'DATABASE_PASSWORD',
    'TEMPORAL_DATABASE_PASSWORD',
    'JWT_SECRET',
    'ENCRYPTION_SECRET',
    'BULK_PRIVATE_INTERNAL_TOKEN',
    'META_WEBHOOK_VERIFY_TOKEN'
  ) -join ', '
  CloudflareEndpointConfigured = [bool]$CloudflareAccountId
  OverwriteProtection = $true
}
