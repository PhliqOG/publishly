[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = 'root',

  [string]$IdentityFile,

  [string]$EnvFile,

  [string]$CloudflareTunnelCredentials,

  [switch]$ExportInterimDatabase,

  [string]$RemoteRoot = '/opt/publishly',

  [switch]$Bootstrap
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$bootstrapFile = Join-Path $repoRoot 'deploy\vps\bootstrap-ubuntu.sh'
$composeFile = Join-Path $repoRoot 'deploy\compose.production.yaml'
$envTemplate = Join-Path $repoRoot '.env.production.example'

foreach ($requiredFile in @($bootstrapFile, $composeFile, $envTemplate)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required deployment file is missing: $requiredFile"
  }
}

$sshArgs = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
if ($IdentityFile) {
  $resolvedIdentity = (Resolve-Path -LiteralPath $IdentityFile).Path
  $sshArgs += @('-i', $resolvedIdentity)
}

$target = "${User}@${HostName}"
$releaseId = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$remoteArchive = "/tmp/publishly-${releaseId}.tgz"
$remoteEnv = "/tmp/publishly-${releaseId}.env"
$remoteTunnelCredentials = "/tmp/publishly-${releaseId}-tunnel.json"
$remoteDatabaseDump = "/tmp/publishly-${releaseId}-database.dump"
$archive = Join-Path ([System.IO.Path]::GetTempPath()) "publishly-${releaseId}.tgz"
$preparedEnv = Join-Path ([System.IO.Path]::GetTempPath()) "publishly-${releaseId}.prepared.env"
$databaseDump = Join-Path ([System.IO.Path]::GetTempPath()) "publishly-${releaseId}-database.dump"
$releaseTag = ''
$buildRevision = ''
$resolvedTunnelCredentials = ''
$cloudflareTunnelId = ''

function Set-EnvironmentValue {
  param(
    [Collections.Generic.List[string]]$Lines,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
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

function Set-OrAddEnvironmentValue {
  param(
    [Collections.Generic.List[string]]$Lines,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $indexes = @()
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if ($Lines[$index] -match ('^{0}=' -f [regex]::Escape($Name))) {
      $indexes += $index
    }
  }
  if ($indexes.Count -gt 1) {
    throw "Expected at most one $Name entry in the production environment; found $($indexes.Count)."
  }
  if ($indexes.Count -eq 1) {
    $Lines[$indexes[0]] = "$Name=$Value"
  }
  else {
    $Lines.Add("$Name=$Value")
  }
}

if ($CloudflareTunnelCredentials) {
  $resolvedTunnelCredentials = (Resolve-Path -LiteralPath $CloudflareTunnelCredentials).Path
  try {
    $tunnelCredential = Get-Content -LiteralPath $resolvedTunnelCredentials -Raw |
      ConvertFrom-Json
  }
  catch {
    throw 'The Cloudflare tunnel credential file is not valid JSON.'
  }
  $cloudflareTunnelId = [string]$tunnelCredential.TunnelID
  if (
    $cloudflareTunnelId -notmatch '^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' -or
    -not $tunnelCredential.AccountTag -or
    -not $tunnelCredential.TunnelSecret
  ) {
    throw 'The Cloudflare tunnel credential is incomplete or has an invalid tunnel id.'
  }
}

if ($ExportInterimDatabase) {
  $pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
  $interimEnv = Join-Path $repoRoot '.env'
  if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) {
    throw "PostgreSQL 18 pg_dump is required to export the interim database: $pgDump"
  }
  if (-not (Test-Path -LiteralPath $interimEnv -PathType Leaf)) {
    throw "The interim environment is missing: $interimEnv"
  }
  $databaseUrlLine = Get-Content -LiteralPath $interimEnv |
    Where-Object { $_ -match '^DATABASE_URL=' } |
    Select-Object -First 1
  if (-not $databaseUrlLine) {
    throw 'DATABASE_URL is missing from the interim environment.'
  }
  $databaseUrl = [Uri]($databaseUrlLine.Substring('DATABASE_URL='.Length).
    Trim().Trim('"') -replace '@localhost:5433/', '@127.0.0.1:5433/')
  $databaseUserInfo = $databaseUrl.UserInfo.Split(':', 2)
  if ($databaseUserInfo.Count -ne 2) {
    throw 'The interim DATABASE_URL must contain a username and password.'
  }
  $previousPgPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = [Uri]::UnescapeDataString($databaseUserInfo[1])
    & $pgDump `
      --host=$($databaseUrl.Host) `
      --port=$($databaseUrl.Port) `
      --username=$([Uri]::UnescapeDataString($databaseUserInfo[0])) `
      --dbname=$($databaseUrl.AbsolutePath.TrimStart('/')) `
      --format=custom `
      --no-owner `
      --no-privileges `
      --file=$databaseDump
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $databaseDump -PathType Leaf)) {
      throw 'Could not export the interim Publishly database.'
    }
  }
  finally {
    $env:PGPASSWORD = $previousPgPassword
  }
}

try {
  $tarArgs = @(
    '-czf', $archive,
    '--exclude=.git',
    '--exclude=.env',
    '--exclude=.env.*',
    '--exclude=node_modules',
    '--exclude=.next',
    '--exclude=.next-*',
    '--exclude=dist',
    '--exclude=.dist-*',
    '--exclude=.nx',
    '--exclude=coverage',
    '--exclude=tmp',
    '--exclude=.building',
    '--exclude=.runtime',
    '--exclude=.runtime-logs',
    '--exclude=.server-runtime',
    '--exclude=*.log',
    '-C', $repoRoot,
    '.'
  )
  & tar @tarArgs
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the deployment archive.' }

  $archiveSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  $releaseTag = "release-$releaseId-$($archiveSha256.Substring(0, 12))"
  $buildRevision = "archive-sha256:$archiveSha256"

  if ($EnvFile) {
    $resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
    $envLines = [Collections.Generic.List[string]]::new()
    Get-Content -LiteralPath $resolvedEnv | ForEach-Object { $envLines.Add($_) }
    Set-EnvironmentValue -Lines $envLines -Name 'PUBLISHLY_IMAGE_TAG' -Value $releaseTag
    Set-EnvironmentValue -Lines $envLines -Name 'PUBLISHLY_BUILD_REVISION' -Value $buildRevision
    if ($resolvedTunnelCredentials) {
      Set-OrAddEnvironmentValue -Lines $envLines -Name 'COMPOSE_PROFILES' -Value 'tunnel'
      Set-OrAddEnvironmentValue -Lines $envLines -Name 'PUBLISHLY_BIND_ADDRESS' -Value '127.0.0.1'
      Set-OrAddEnvironmentValue -Lines $envLines -Name 'PUBLISHLY_CADDY_ADDRESS' -Value 'http://publishlyapi.com'
      Set-OrAddEnvironmentValue -Lines $envLines -Name 'PUBLISHLY_CADDY_WWW_ADDRESS' -Value 'http://www.publishlyapi.com'
      Set-OrAddEnvironmentValue -Lines $envLines -Name 'CLOUDFLARE_TUNNEL_ID' -Value $cloudflareTunnelId
    }
    $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($preparedEnv, $envLines, $utf8WithoutBom)

    & pnpm run verify:production -- $preparedEnv
    if ($LASTEXITCODE -ne 0) { throw 'Production environment validation failed.' }
  }

  if ($Bootstrap) {
    & scp @sshArgs -- $bootstrapFile "${target}:/tmp/publishly-bootstrap.sh"
    if ($LASTEXITCODE -ne 0) { throw 'Could not upload the VPS bootstrap.' }

    & ssh @sshArgs -- $target 'bash /tmp/publishly-bootstrap.sh && rm -f /tmp/publishly-bootstrap.sh'
    if ($LASTEXITCODE -ne 0) { throw 'The VPS bootstrap failed.' }
  }

  if ($EnvFile) {
    & scp @sshArgs -- $preparedEnv "${target}:${remoteEnv}"
    if ($LASTEXITCODE -ne 0) { throw 'Could not upload the production environment file.' }
  }

  if ($resolvedTunnelCredentials) {
    & scp @sshArgs -- $resolvedTunnelCredentials "${target}:${remoteTunnelCredentials}"
    if ($LASTEXITCODE -ne 0) { throw 'Could not upload the Cloudflare tunnel credential.' }
  }

  if ($ExportInterimDatabase) {
    & scp @sshArgs -- $databaseDump "${target}:${remoteDatabaseDump}"
    if ($LASTEXITCODE -ne 0) { throw 'Could not upload the interim database dump.' }
  }

  & scp @sshArgs -- $archive "${target}:${remoteArchive}"
  if ($LASTEXITCODE -ne 0) { throw 'Could not upload the deployment archive.' }

  $remoteScript = @"
set -Eeuo pipefail
trap "rm -f '$remoteArchive' '$remoteEnv' '$remoteTunnelCredentials' '$remoteDatabaseDump'" EXIT
remote_root='$RemoteRoot'
release_id='$releaseId'
release_tag='$releaseTag'
build_revision='$buildRevision'
cloudflare_tunnel_id='$cloudflareTunnelId'
release_dir="`${remote_root}/releases/`${release_id}"
install -d -m 0755 "`${release_dir}"
tar -xzf '$remoteArchive' -C "`${release_dir}"
rm -f '$remoteArchive'
if [[ -f '$remoteEnv' ]]; then
  install -m 0600 '$remoteEnv' "`${remote_root}/shared/.env.production"
  rm -f '$remoteEnv'
fi
if [[ -f '$remoteTunnelCredentials' ]]; then
  install -m 0600 '$remoteTunnelCredentials' "`${remote_root}/shared/cloudflared-credentials.json"
  rm -f '$remoteTunnelCredentials'
fi
if [[ ! -f "`${remote_root}/shared/.env.production" ]]; then
  echo 'No production environment exists on the server.' >&2
  echo 'Pass -EnvFile on the first deployment.' >&2
  exit 42
fi
env_file="`${remote_root}/shared/.env.production"
set_env_value() {
  local key="`$1"
  local value="`$2"
  if grep -q "^`${key}=" "`${env_file}"; then
    sed -i "s|^`${key}=.*|`${key}=`${value}|" "`${env_file}"
  else
    printf '%s=%s\n' "`${key}" "`${value}" >> "`${env_file}"
  fi
}
set_env_value PUBLISHLY_IMAGE_TAG "`${release_tag}"
set_env_value PUBLISHLY_BUILD_REVISION "`${build_revision}"
if [[ -n "`${cloudflare_tunnel_id}" ]]; then
  set_env_value COMPOSE_PROFILES tunnel
  set_env_value PUBLISHLY_BIND_ADDRESS 127.0.0.1
  set_env_value PUBLISHLY_CADDY_ADDRESS http://publishlyapi.com
  set_env_value PUBLISHLY_CADDY_WWW_ADDRESS http://www.publishlyapi.com
  set_env_value CLOUDFLARE_TUNNEL_ID "`${cloudflare_tunnel_id}"
fi
chmod 0600 "`${env_file}"
ln -sfn "`${remote_root}/shared/.env.production" "`${release_dir}/.env.production"
cd "`${release_dir}"
docker compose --env-file .env.production -f deploy/compose.production.yaml config --quiet
docker compose --env-file .env.production -f deploy/compose.production.yaml build
if [[ -f '$remoteDatabaseDump' ]]; then
  docker compose --env-file .env.production -f deploy/compose.production.yaml up -d --wait postgres
  existing_tables="`$(
    docker compose --env-file .env.production -f deploy/compose.production.yaml \
      exec -T postgres psql -U publishly -d publishly -Atc \
      "select count(*) from information_schema.tables where table_schema = 'public';"
  )"
  if [[ "`${existing_tables}" != '0' ]]; then
    echo 'Refusing to restore the interim database into a non-empty production database.' >&2
    exit 43
  fi
  docker compose --env-file .env.production -f deploy/compose.production.yaml \
    exec -T postgres pg_restore -U publishly -d publishly \
      --no-owner --no-privileges < '$remoteDatabaseDump'
  rm -f '$remoteDatabaseDump'
fi
docker compose --env-file .env.production -f deploy/compose.production.yaml up -d --remove-orphans --wait --wait-timeout 1200
docker compose --env-file .env.production -f deploy/compose.production.yaml ps
ln -sfn "`${release_dir}" "`${remote_root}/current"
echo "Publishly release `${release_id} is running."
"@

  $remoteScript | & ssh @sshArgs -- $target 'bash -s'
  if ($LASTEXITCODE -ne 0) { throw 'The remote Publishly deployment failed.' }
}
finally {
  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }
  if (Test-Path -LiteralPath $preparedEnv) {
    Remove-Item -LiteralPath $preparedEnv -Force
  }
  if (Test-Path -LiteralPath $databaseDump) {
    Remove-Item -LiteralPath $databaseDump -Force
  }
}
