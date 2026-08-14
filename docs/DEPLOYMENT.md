# Deployment

## Supported topology

The checked-in production reference runs Caddy, separate frontend/backend/
worker containers, app PostgreSQL, Redis, Temporal with its own PostgreSQL and
Elasticsearch, and an optional loopback-only Temporal UI. Media uses an
external S3-compatible bucket. For larger installations, replace the bundled
stateful services with managed PostgreSQL, Redis, Temporal Cloud, and object
storage while retaining the three stateless application roles.

Minimum practical single-host starting point: 4 vCPU, 12 GB RAM, 80 GB SSD plus
external object storage. Size from measured worker concurrency and calendar/
analytics traffic; Elasticsearch and production builds are the largest memory
consumers.

## First production deployment

1. Point the application DNS record to the host and open TCP 80/443. Caddy uses
   ACME and redirects/terminates HTTPS.
2. Copy `.env.production.example` to an operator-only `.env.production` and
   replace every `CHANGE_ME`. Complete [ENVIRONMENT.md](ENVIRONMENT.md) and the
   provider submission sequence in
   [APPROVAL_AND_LAUNCH.md](APPROVAL_AND_LAUNCH.md).
3. Create the private S3 bucket, public/CDN media hostname, lifecycle rules for
   abandoned multipart uploads, and bucket CORS described in
   [ENVIRONMENT.md](ENVIRONMENT.md).
4. Validate before mutating anything. The first command rejects placeholders,
   unsafe production switches, missing billing/mail/storage credentials, and
   any advertised launch provider that is not configured:

   ```bash
   pnpm run verify:production -- .env.production
   docker compose --env-file .env.production \
     -f deploy/compose.production.yaml config --quiet
   ```

5. Build and start. The one-shot `migrate` service must succeed before the app
   roles become healthy:

   ```bash
   docker compose --env-file .env.production \
     -f deploy/compose.production.yaml build
   docker compose --env-file .env.production \
     -f deploy/compose.production.yaml up -d
   docker compose --env-file .env.production \
     -f deploy/compose.production.yaml ps
   ```

6. Verify `https://<domain>/`, `https://<domain>/api/health`,
   `https://<domain>/api/public/status` (including a fresh
   `publishing_engine` heartbeat), registration, email verification, a
   test-provider schedule in staging, and Stripe test webhooks before enabling
   any real provider.
7. Before sending any platform review, verify the public `/privacy`, `/terms`,
   `/acceptable-use`, `/data-deletion`, `/platform-review`, and `/status`
   routes, then capture the exact evidence pack described in
   [APPROVAL_AND_LAUNCH.md](APPROVAL_AND_LAUNCH.md). Do not submit screenshots
   from localhost, staging domains, or a build whose requested scopes differ
   from `data/provider-approval-manifest.json`.

The production edge waits for frontend, backend, and the durable orchestrator
heartbeat to become healthy before it accepts traffic. The compose file does
not publish PostgreSQL, Redis, Temporal, or Elasticsearch. The optional
Temporal UI is bound to `127.0.0.1:8080` under the `ops` profile and must be
reached through a VPN/SSH tunnel, never public DNS.

## Build details

The image uses Node 22, pnpm 10, FFmpeg, `tini`, and the production builds for
all three apps. `NEXT_PUBLIC_*` values are compile-time Docker build arguments;
changing the public API URL or brand requires rebuilding the frontend image.

```bash
pnpm install --frozen-lockfile
pnpm run verify:production -- .env.production
pnpm run prisma-format
pnpm run prisma-validate
pnpm run prisma-generate
pnpm run build
```

Build the orchestrator with its Nest builder. Temporal bundles workflow code at
worker startup, and raw TypeScript output does not rewrite all monorepo aliases.

## Reverse proxy routes

The reference Caddyfile sends `/api/*` to backend `:3000` after stripping
`/api`; everything else goes to Next `:4200`. Consequently:

- public backend URL: `https://app.example.com/api`;
- OAuth redirects: `https://app.example.com/integrations/social/<provider>`;
- Stripe webhook: `https://app.example.com/api/stripe`;
- Meta deletion callback: `https://app.example.com/api/public/meta/data-deletion`;
- Meta deletion instructions/status: `https://app.example.com/data-deletion`.

If frontend and API use separate hosts, update CORS, cookie domain behavior,
all provider redirect registrations, and the URLs above as one change.

## Migrations and releases

Migrations are additive, checked in, and applied with:

```bash
pnpm run prisma-migrate-status
pnpm run prisma-migrate-deploy
```

Release procedure:

1. tag and retain the currently running image;
2. take/verify database and object-storage backups;
3. run `migrate deploy` as a one-shot job;
4. start backend/worker/frontend and wait for health;
5. run the mandatory tenant-isolation and exact 100,000-job gates and retain
   their machine artifact for this exact `PUBLISHLY_BUILD_REVISION`;
6. execute the Test Provider canary and a read-only tenant smoke test;
7. run the read-only Bulk Scheduler provider preflight from
   [BULK_SCHEDULER_CANARY.md](BULK_SCHEDULER_CANARY.md);
8. only with a Publishly-owned designated account, execute the exact
   real-provider tuple canary and independently review its confirmed-live,
   attempt, private-fetch, and redaction evidence;
9. enable only the reviewed tuple gradually while retaining both kill-switch
   layers.

The build workflow makes the Bulk Scheduler tenant-isolation and exact
100,000-job PostgreSQL workloads required checks. Their JSON benchmark artifact
must be `passed` for the exact commit being deployed. A green unit suite,
provider mock, smaller local sample, or previously generated artifact is not a
substitute. These gates never invoke a provider and therefore must run before
the Stage 8 designated-account canary.

Do not run `prisma db push`, `prisma migrate reset`, or restore an older schema
over newer application code in production. Rollback normally means redeploying
the previous image while leaving backward-compatible additive migrations in
place. A destructive schema rollback requires a reviewed forward migration or
full restore into a new database; see [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## Scaling

- Frontend and backend can scale horizontally behind the load balancer.
- Set `RUN_CRON=true` on exactly one backend instance.
- Workers can scale horizontally; Temporal distributes provider task queues.
- Keep the same `JWT_SECRET`, `ENCRYPTION_SECRET`, database, Redis, storage, and
  Temporal namespace across a deployment.
- Do not reduce an active provider's concurrency without measuring queue lag,
  provider limits, and account-level quotas.

## Automatic restart and shutdown

Compose uses `restart: unless-stopped`; `tini` forwards termination signals so
Node and workers can shut down cleanly. During a deploy, allow worker shutdown
to finish before removing the old container. Temporal reschedules unfinished
activities, while ambiguous provider mutations remain fail-closed.

## Backups and monitoring

Back up app PostgreSQL, Temporal PostgreSQL, the S3 bucket, and encrypted copies
of deployment secrets. Redis is operational/cache state but AOF is enabled in
the reference compose. Exact schedules, restore drills, RPO/RTO assumptions,
and key-loss consequences are in [BACKUPS.md](BACKUPS.md) and
[DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

Monitor backend `/health`, worker `/health/status`, queue age/failures,
publishing-job state, webhook failures, storage usage, Postgres capacity, Redis
latency, and Temporal/Elasticsearch health. The operator page is
`/admin/operations`.
