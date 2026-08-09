# Deployment

## Local development stack

`docker-compose.publishly.dev.yaml` (kept separate from upstream's compose for
a clean merge path):

| Service | Host port | Notes |
| --- | --- | --- |
| Postgres 17 (app) | 5433 | db `publishly-db-local`, user/pwd `publishly-local(-pwd)` |
| Redis 7 | 6380 | queues, OAuth state, rate limits, caches |
| Temporal 1.28 auto-setup | 7233 | depends on its own Postgres 16 + Elasticsearch |
| Temporal UI | 8082 | inspect workflows (`post_<id>`) |
| Elasticsearch 7.17 | internal | **required** (Text search-attribute cap on SQL visibility); 256 MB heap |

`.env` dev defaults in `.env.example` already match these ports.

## Build

```bash
pnpm install                       # Node >=22.12 <23, pnpm 10 (pnpm 9 will try to
                                   # compile node-canvas from source on Windows and fail)
pnpm run prisma-db-push            # applies schema + generates the client
pnpm run build                     # frontend + backend + orchestrator (nest build)
```

Two build facts that matter:

1. **The orchestrator must be built with `nest build`** (which the root
   `build` script uses). Nest's builder rewrites `@gitroom/*` path aliases to
   relative requires; Temporal's worker bundles workflow files with webpack at
   startup and cannot resolve un-rewritten aliases. Output from plain `tsc`
   will boot the HTTP part and then fail with `Module not found:
   @gitroom/...` during workflow bundling.
2. The backend from `nest build` output runs plainly
   (`pnpm run start:prod:backend`). If you ever run raw-`tsc` output instead,
   preload the alias map: `node -r tsconfig-paths/register` with
   `TS_NODE_PROJECT=tsconfig.runtime.json` (checked into each app).

## Production stack

Run as split services (recommended; upstream also publishes an all-in-one
container image, workable for small installs):

- **frontend** — `pnpm run start:prod:frontend` (Next standalone, :4200)
- **backend** — `pnpm run start:prod:backend` (:3000); set `RUN_CRON=true` on
  exactly one backend instance (it registers the hourly sweeper workflow)
- **orchestrator** — `pnpm run start:prod:orchestrator` (workers; scale
  horizontally, Temporal splits activity concurrency across instances)
- **Postgres 14+**, **Redis**, **Temporal cluster** (self-hosted with
  Elasticsearch visibility, or Temporal Cloud via
  `TEMPORAL_ADDRESS`/`TEMPORAL_NAMESPACE`/`TEMPORAL_API_KEY`/`TEMPORAL_TLS`)
- **Storage:** `STORAGE_PROVIDER=cloudflare` (R2 / any S3-compatible via the
  CLOUDFLARE_* vars) for anything beyond single-node installs; `local` needs a
  persistent `UPLOAD_DIRECTORY` volume
- **Email:** `EMAIL_PROVIDER=resend` (RESEND_API_KEY) or `nodemailer` (SMTP
  EMAIL_* vars). With no provider configured, signup skips activation email —
  fine for testing, not for production.

Reverse proxy rules: `FRONTEND_URL` must be exactly the public URL users hit;
`NEXT_PUBLIC_BACKEND_URL` the public API URL (commonly `<domain>/api` proxied
to :3000); `BACKEND_INTERNAL_URL` the in-network URL the frontend server uses;
`MAIN_URL` the canonical site URL. None may end with `/` (the config checker
flags it).

Set **`CONFIG_STRICT=true`** in production: configuration issues then refuse
boot instead of warning (secret strength, partial provider credentials,
incomplete Stripe/storage groups).

Stripe: set the three keys + webhook endpoint `<backend>/stripe` with the
signing secret in `STRIPE_SIGNING_KEY`. Create Products/Prices whose
`lookup_key`s match the tier/period naming the billing service queries —
verify against `libraries/nestjs-libraries/src/services/stripe.service.ts`
when configuring.

## Migrations

Upstream applies schema with `prisma db push` (no migration history). That is
acceptable up to the first real production deploy; from that point adopt
`prisma migrate` (`migrate dev` to author against the current schema, `migrate
deploy` in CI) so schema changes are reviewable and reversible. All Publishly
schema additions are additive and safe to baseline.

## Backups

- App Postgres (all tenant data)
- Uploads: the `UPLOAD_DIRECTORY` volume or the R2/S3 bucket
- Temporal's Postgres (workflow state; losing it loses in-flight schedules but
  not the Post rows — the sweeper re-queues due posts after re-registration)
- `.env` / secret-manager material (JWT_SECRET + ENCRYPTION_SECRET: losing the
  encryption secret orphans sealed tokens — users must reconnect channels)
