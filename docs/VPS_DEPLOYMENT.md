# Publishly VPS deployment

Publishly does not require Docker Desktop or this Windows computer after the
production cutover. Docker Engine and Compose run continuously on the VPS;
that is server-side infrastructure, not a dependency on the owner's computer.
The public domain then points to the VPS, so Publishly stays online while the
Windows computer and its local Docker Desktop are off.

Running every component directly under systemd is possible, but the supported
build uses Compose because Publishly also needs PostgreSQL, Redis, Temporal,
Temporal's database, and Elasticsearch. Compose provides restart policies,
private service networking, health checks, persistent volumes, and one
repeatable deployment command without exposing those services publicly.

## Host requirements

- Ubuntu 24.04 LTS
- 4 vCPU minimum, 12 GB RAM minimum, and 80 GB SSD minimum
- a public IPv4 address
- inbound TCP 22, 80, and 443 plus UDP 443
- an SSH key for the root account during initial setup
- external S3-compatible object storage

The reference Compose stack runs Caddy, the frontend, API, orchestrator,
PostgreSQL, Redis, Temporal, Temporal PostgreSQL, and Elasticsearch. Only Caddy
publishes public ports.

## Cloudflare R2 storage prepared for production

The following Cloudflare resources are already created:

- public media bucket: `publishly-media-production`
- private bulk-media bucket: `publishly-bulk-private-production`
- public media hostname: `https://media.publishlyapi.com` (ownership and TLS
  active, minimum TLS 1.2)

Before deployment, create two bucket-scoped R2 API tokens in **Cloudflare > R2
Object Storage > Manage R2 API tokens**. Give each token **Object Read & Write**
access only to its matching bucket. Put the resulting S3 Access Key ID and
Secret Access Key into the matching `S3_*` or `BULK_PRIVATE_S3_*` fields in the
private production environment file. Never put those credentials in Git.

Use the account-specific S3 endpoint shown in the R2 dashboard:

```dotenv
S3_ENDPOINT=https://CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=publishly-media-production
S3_PUBLIC_URL=https://media.publishlyapi.com
BULK_PRIVATE_S3_ENDPOINT=https://CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com
BULK_PRIVATE_S3_REGION=auto
BULK_PRIVATE_S3_BUCKET=publishly-bulk-private-production
```

The private bucket must not have a public development URL or custom domain.
After adding credentials, test a public upload/download/delete cycle and a
private presigned provider-media fetch before switching the production app to
R2.

## First deployment from Windows

Create a Hetzner Cloud project and place one read/write project API token in
`%LOCALAPPDATA%\Publishly\hcloud.token` (one line, no quotes). Then provision
the price-capped production host:

```powershell
.\scripts\provision-hetzner-vps.ps1
```

The provisioner is idempotent. It chooses the x86 `cx43` plan in Nuremberg
(8 shared vCPU, 16 GB RAM, 160 GB disk), includes Hetzner backups, refuses a
monthly total above 40 units of the account currency, registers only the
prepared Publishly SSH key, and attaches a firewall that permits inbound SSH
only. Cloudflare Tunnel handles web traffic over outbound connections.

1. Generate the private environment file outside the repository. The helper
   creates cryptographically random infrastructure secrets, synchronizes the
   database password and URL, applies a current-user-only Windows ACL, and
   refuses to overwrite an existing file:

   ```powershell
   .\scripts\prepare-production-env.ps1 `
     -CloudflareAccountId YOUR_32_CHARACTER_ACCOUNT_ID
   ```

   The default destination is
   `%LOCALAPPDATA%\Publishly\publishly.production.env`. Fill its remaining
   `CHANGE_ME` values with the real legal, email, billing, R2, Meta, TikTok, and
   release values. Keep it private.
2. Validate and deploy from PowerShell:

   ```powershell
   .\scripts\deploy-vps.ps1 `
     -HostName 203.0.113.10 `
     -IdentityFile C:\secure\publishly_ed25519 `
     -EnvFile C:\secure\publishly.production.env `
     -Bootstrap
   ```

   Publishly already has a named Cloudflare Tunnel and both public hostnames
   route to it. The preferred first cutover reuses that narrowly scoped tunnel
   credential, needs no DNS-write token, and keeps Caddy bound to VPS loopback:

   ```powershell
   .\scripts\deploy-vps.ps1 `
     -HostName 203.0.113.10 `
     -IdentityFile C:\Users\Phliq\.ssh\publishly_vps_ed25519 `
     -EnvFile $env:LOCALAPPDATA\Publishly\publishly.production.env `
     -CloudflareTunnelCredentials C:\Users\Phliq\.cloudflared\da4954c5-87e9-43bf-a2d1-1911fe657dfe.json `
     -ExportInterimDatabase `
     -Bootstrap
   ```

The script validates the environment locally, installs Docker when requested,
uploads a clean source archive, stamps the environment with an immutable tag
and the archive SHA-256, builds the image on the VPS, runs migrations, and waits
for the full stack to become healthy before switching the `current` release.
On the first cutover, `-ExportInterimDatabase` creates a temporary PostgreSQL 18
custom-format dump, transfers it only over SSH, refuses to restore over any
non-empty production schema, and deletes both temporary copies. This preserves
the interim user/workspace and integration state without exposing credentials
on a process command line. PostgreSQL 18's named volume is mounted at
`/var/lib/postgresql` rather than the pre-18 `/var/lib/postgresql/data` path so
its version-specific PGDATA remains durable across container recreation.
Services use `restart: unless-stopped`. The archive never includes local
`.env*`, `node_modules`, candidate/previous frontend builds, build output,
logs, or Git history.

Subsequent deployments can omit `-Bootstrap` and `-EnvFile`; the VPS keeps its
operator-only environment file at `/opt/publishly/shared/.env.production`.

## Cloudflare cutover

When tunnel mode is used, do not change DNS. The deployment starts the same
named tunnel on the VPS only after the application stack is healthy. Stop the
Windows tunnel after the VPS tunnel has registered and the public canaries
pass; Cloudflare can run both connectors briefly during the no-downtime
handoff. The tunnel credential can run only this tunnel and cannot administer
the Cloudflare account.

For a direct-origin deployment instead, omit
`-CloudflareTunnelCredentials` and follow the DNS procedure below.

After all containers are healthy, replace the temporary Cloudflare Tunnel DNS
records for `publishlyapi.com` and `www.publishlyapi.com` with proxied records
pointing to the VPS IPv4 address. Keep ports 80 and 443 open so Caddy can obtain
and renew the origin certificate.

Verify:

```text
https://publishlyapi.com/
https://publishlyapi.com/api/health
https://publishlyapi.com/api/public/status
```

SSH to the VPS, change to `/opt/publishly/current`, and run the source,
environment, and deployed-domain gate after DNS has converged:

```bash
cd /opt/publishly/current
docker compose --env-file .env.production -f deploy/compose.production.yaml \
  exec -T frontend node scripts/audit-live-launch.cjs \
  --process-env --origin https://publishlyapi.com
docker compose --env-file .env.production -f deploy/compose.production.yaml \
  exec -T frontend node scripts/verify-public-signup.cjs \
  --origin https://publishlyapi.com
```

The audit checks the actual public pages, health/status JSON, OAuth callback
pages, DNS/TLS, HTTP-to-HTTPS behavior, browser security headers, media origin,
Meta signature rejection and verification challenge, plus the public source
offer. Running it inside `frontend` verifies the exact deployed process
environment, including the immutable image tag and build revision stamped by
the deployment script. It never prints secret values. Do not submit provider
reviews while it returns a nonzero exit code.

The second command performs a real public registration, verifies the secure
HTTP-only session cookie and committed database row, and deletes its uniquely
namespaced disposable user and organization in a `finally` cleanup.

Then test registration, login, media upload, one scheduled post on a designated
test account, and webhook delivery before inviting external users.
