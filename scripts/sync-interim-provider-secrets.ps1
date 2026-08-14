[CmdletBinding()]
param(
  [string]$ProductionEnv = (Join-Path $env:LOCALAPPDATA 'Publishly\publishly.production.env'),
  [string]$HostEnv = (Join-Path $env:LOCALAPPDATA 'Publishly\publishly-host.env')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($requiredFile in @($ProductionEnv, $HostEnv)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required environment file is missing: $requiredFile"
  }
}

function Read-EnvironmentValues {
  param([AllowEmptyString()][string[]]$Lines)

  $values = @{}
  foreach ($rawLine in $Lines) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { continue }
    $name = $line.Substring(0, $separator).Trim()
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
    $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $values[$name] = $value
  }
  return $values
}

$sourceLines = Get-Content -LiteralPath $ProductionEnv
$targetLines = [Collections.Generic.List[string]]::new()
Get-Content -LiteralPath $HostEnv | ForEach-Object { $targetLines.Add($_) }
$source = Read-EnvironmentValues -Lines $sourceLines

# Only non-provider credentials that are safe and necessary for the interim
# callback surface belong here. App/client secrets remain absent until the
# provider issues them and the VPS production environment is ready.
$allowlist = @('META_WEBHOOK_VERIFY_TOKEN')
$synced = @()
foreach ($name in $allowlist) {
  $value = [string]$source[$name]
  if (
    -not $value -or
    $value.Length -lt 32 -or
    $value -match 'CHANGE_ME|REPLACE_ME|example\.com'
  ) {
    throw "$name is missing or still a template in the production environment."
  }

  $indexes = @()
  for ($index = 0; $index -lt $targetLines.Count; $index++) {
    if ($targetLines[$index] -match ('^{0}=' -f [regex]::Escape($name))) {
      $indexes += $index
    }
  }
  if ($indexes.Count -gt 1) {
    throw "$HostEnv contains duplicate $name entries."
  }
  if ($indexes.Count -eq 1) {
    $targetLines[$indexes[0]] = "$name=$value"
  } else {
    $targetLines.Add("$name=$value")
  }
  $synced += $name
}

$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines($HostEnv, $targetLines, $utf8WithoutBom)

[pscustomobject]@{
  HostEnvironment = $HostEnv
  SyncedKeys = $synced -join ','
  SecretValuesPrinted = $false
}
