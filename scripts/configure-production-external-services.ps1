[CmdletBinding()]
param(
  [string]$SourceEnv = 'C:\Users\Phliq\Desktop\Atlas_Agent\.env',
  [string]$ProductionEnv = (Join-Path $env:LOCALAPPDATA 'Publishly\publishly.production.env')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($requiredFile in @($SourceEnv, $ProductionEnv)) {
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
    $values[$name] = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
  }
  return $values
}

function Set-EnvironmentValue {
  param(
    [Collections.Generic.List[string]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $indexes = @()
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if ($Lines[$index] -match ('^{0}=' -f [regex]::Escape($Name))) {
      $indexes += $index
    }
  }
  if ($indexes.Count -ne 1) {
    throw "Expected exactly one $Name entry in the production environment; found $($indexes.Count)."
  }
  $Lines[$indexes[0]] = "$Name=$Value"
}

$source = Read-EnvironmentValues -Lines (Get-Content -LiteralPath $SourceEnv)
$productionLines = [Collections.Generic.List[string]]::new()
Get-Content -LiteralPath $ProductionEnv | ForEach-Object { $productionLines.Add($_) }
$production = Read-EnvironmentValues -Lines $productionLines

$cloudflareToken = [string]$source.CLOUDFLARE_API_TOKEN
$cloudflareAccountId = [string]$source.CLOUDFLARE_ACCOUNT_ID
$stripePublishableKey = [string]$source.STRIPE_PUBLISHABLE_KEY
$stripeSecretKey = [string]$source.STRIPE_SECRET_KEY
$operationsEmail = [string]$source.MASTER_HQ_EMAIL
if (-not $cloudflareToken -or $cloudflareAccountId -notmatch '^[0-9a-f]{32}$') {
  throw 'The source environment does not contain usable Cloudflare credentials.'
}
if (
  $stripePublishableKey -notmatch '^pk_live_' -or
  $stripeSecretKey -notmatch '^sk_live_'
) {
  throw 'The source environment must contain live Stripe publishable and secret keys.'
}
if ($operationsEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  throw 'The source environment must contain a valid MASTER_HQ_EMAIL for ACME notices.'
}

$cloudflareHeaders = @{
  Authorization = "Bearer $cloudflareToken"
  'Content-Type' = 'application/json'
}
$tokenVerification = Invoke-RestMethod `
  -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' `
  -Headers $cloudflareHeaders -Method Get
if (
  -not $tokenVerification.success -or
  $tokenVerification.result.status -ne 'active' -or
  [string]$tokenVerification.result.id -notmatch '^[0-9a-f]{32}$'
) {
  throw 'The configured Cloudflare API token is not active.'
}

$r2AccessKeyId = [string]$tokenVerification.result.id
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $r2SecretBytes = $sha256.ComputeHash(
    [Text.Encoding]::UTF8.GetBytes($cloudflareToken)
  )
}
finally {
  $sha256.Dispose()
}
$r2SecretAccessKey = ([BitConverter]::ToString($r2SecretBytes) -replace '-', '').ToLowerInvariant()
$r2Endpoint = "https://${cloudflareAccountId}.r2.cloudflarestorage.com"
$node = Join-Path $env:LOCALAPPDATA 'Publishly\Node22\node-v22.12.0-win-x64\node.exe'
$r2Verifier = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\verify-r2-derived-credentials.cjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw "Node 22 runtime is missing: $node"
}

$previousCanaryEnvironment = @{}
foreach ($name in @(
  'R2_CANARY_ENDPOINT',
  'R2_CANARY_ACCESS_KEY_ID',
  'R2_CANARY_SECRET_ACCESS_KEY',
  'R2_CANARY_PUBLIC_BUCKET',
  'R2_CANARY_PRIVATE_BUCKET'
)) {
  $previousCanaryEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
  $env:R2_CANARY_ENDPOINT = $r2Endpoint
  $env:R2_CANARY_ACCESS_KEY_ID = $r2AccessKeyId
  $env:R2_CANARY_SECRET_ACCESS_KEY = $r2SecretAccessKey
  $env:R2_CANARY_PUBLIC_BUCKET = 'publishly-media-production'
  $env:R2_CANARY_PRIVATE_BUCKET = 'publishly-bulk-private-production'
  & $node $r2Verifier
  if ($LASTEXITCODE -ne 0) { throw 'The derived R2 credentials failed their canary.' }
}
finally {
  foreach ($name in $previousCanaryEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable(
      $name,
      $previousCanaryEnvironment[$name],
      'Process'
    )
  }
}

$stripeAuthorization = [Convert]::ToBase64String(
  [Text.Encoding]::ASCII.GetBytes("${stripeSecretKey}:")
)
$stripeHeaders = @{ Authorization = "Basic $stripeAuthorization" }
$webhookUrl = 'https://publishlyapi.com/api/stripe'
$webhookEvents = @(
  'invoice.payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
)
$endpoints = Invoke-RestMethod `
  -Uri 'https://api.stripe.com/v1/webhook_endpoints?limit=100' `
  -Headers $stripeHeaders -Method Get
$matchingEndpoints = @($endpoints.data | Where-Object { $_.url -eq $webhookUrl })
if ($matchingEndpoints.Count -gt 1) {
  throw 'More than one live Stripe webhook targets Publishly; consolidate them before continuing.'
}

$stripeSigningKey = [string]$production.STRIPE_SIGNING_KEY
$webhookCreated = $false
if ($matchingEndpoints.Count -eq 0) {
  $webhookBodyParts = [Collections.Generic.List[string]]::new()
  $webhookBodyParts.Add('url=' + [Uri]::EscapeDataString($webhookUrl))
  $webhookBodyParts.Add(
    'description=' + [Uri]::EscapeDataString('Publishly production billing')
  )
  foreach ($eventName in $webhookEvents) {
    $webhookBodyParts.Add(
      'enabled_events%5B%5D=' + [Uri]::EscapeDataString($eventName)
    )
  }
  $webhookBody = $webhookBodyParts -join '&'
  $createdEndpoint = Invoke-RestMethod `
    -Uri 'https://api.stripe.com/v1/webhook_endpoints' `
    -Headers $stripeHeaders -Method Post `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body $webhookBody
  if (
    -not $createdEndpoint.livemode -or
    $createdEndpoint.url -ne $webhookUrl -or
    [string]$createdEndpoint.secret -notmatch '^whsec_'
  ) {
    throw 'Stripe did not return a complete live Publishly webhook endpoint.'
  }
  $stripeSigningKey = [string]$createdEndpoint.secret
  $webhookCreated = $true
}
elseif ($stripeSigningKey -notmatch '^whsec_') {
  throw 'A Publishly Stripe webhook already exists, but its signing secret is not stored in the production environment.'
}

$updates = [ordered]@{
  ACME_EMAIL = $operationsEmail
  NEXT_PUBLIC_SUPPORT_EMAIL = $operationsEmail
  NEXT_PUBLIC_PRIVACY_EMAIL = $operationsEmail
  NEXT_PUBLIC_SOURCE_URL = 'https://github.com/PhliqOG/publishly'
  S3_ENDPOINT = $r2Endpoint
  S3_ACCESS_KEY_ID = $r2AccessKeyId
  S3_SECRET_ACCESS_KEY = $r2SecretAccessKey
  BULK_PRIVATE_S3_ENDPOINT = $r2Endpoint
  BULK_PRIVATE_S3_ACCESS_KEY_ID = $r2AccessKeyId
  BULK_PRIVATE_S3_SECRET_ACCESS_KEY = $r2SecretAccessKey
  STRIPE_PUBLISHABLE_KEY = $stripePublishableKey
  STRIPE_SECRET_KEY = $stripeSecretKey
  STRIPE_SIGNING_KEY = $stripeSigningKey
}
foreach ($entry in $updates.GetEnumerator()) {
  Set-EnvironmentValue -Lines $productionLines -Name $entry.Key -Value $entry.Value
}

$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines($ProductionEnv, $productionLines, $utf8WithoutBom)

[pscustomobject]@{
  ProductionEnvironment = $ProductionEnv
  R2Canary = 'passed-public-and-private'
  R2CredentialScope = 'existing-token-policy'
  StripeWebhook = if ($webhookCreated) { 'created' } else { 'already-present' }
  UpdatedKeys = $updates.Keys -join ','
  SecretValuesPrinted = $false
}
