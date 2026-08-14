# Publishly

Publishly is a multi-tenant social-media management SaaS built on the
[Postiz](https://github.com/gitroomhq/postiz-app) engine. It provides a universal
composer, content calendar, durable scheduling, analytics snapshots, a unified
comment inbox, bulk CSV operations, Stripe billing, scoped customer API keys,
operator tooling, and an original responsive marketing site.

The product name is **Publishly**. Brand strings live in the shared brand module
and can be overridden with `NEXT_PUBLIC_BRAND_NAME`; provider and tenant logic do
not depend on the commercial name.

## Implemented product surface

- Workspaces with owner/admin/member authorization, invitations, ownership
  transfer, tenant-scoped repositories, audit logs, export, and deletion.
- Official integrations for Facebook, Instagram, Instagram Login, TikTok,
  YouTube, X, Threads, LinkedIn members/pages, Pinterest, Bluesky, and Mastodon,
  while preserving useful upstream providers. Unconfigured providers are shown
  disabled with the exact missing environment variables.
- Implementation-backed provider capability registry for image, video,
  carousel, story, short-form video, scheduling, first comment, thumbnail,
  collaborators, tags, analytics, comments, and replies.
- Object-storage media pipeline with local development storage or generic
  S3-compatible storage, signed/multipart uploads, MIME sniffing, metadata,
  thumbnails, SHA-256 deduplication, quotas, and delayed cleanup.
- Temporal publishing workflows plus a `PublishingJob` ledger. Safe,
  explicitly pre-request transient failures retry with backoff; an ambiguous
  post-request outcome fails closed and is never automatically replayed.
- Month/week/day/list calendar, per-platform composer settings and previews,
  drafts, duplicate/edit flows, server-side validation, and bulk imports that
  execute in the worker rather than the request process.
- Provider-reported analytics only, with retention-aware historical snapshots;
  unavailable metrics remain unavailable rather than being estimated.
- Unified comment inbox with read/resolved/assignment/notes state. Official
  Facebook and Instagram comment/reply adapters are implemented; other
  providers are exposed only when their adapter advertises support.
- Stripe Checkout/portal/webhooks and deploy-time entitlement overrides.
  Subscription truth and limits are enforced server-side.
- Hashed, scoped `pub_` API keys; legacy workspace keys are disabled unless an
  operator explicitly enables the migration escape hatch.
- Signed outgoing webhooks with delivery attempts, a signed Meta data-deletion
  callback, health/readiness probes, structured request/job context, and an
  internal operations dashboard.

## Local quickstart

Requirements: Node.js `>=22.12 <23`, pnpm 10, Docker, and FFmpeg for local media
processing.

```bash
docker compose -f docker-compose.publishly.dev.yaml up -d
cp .env.example .env
pnpm install --frozen-lockfile
pnpm run prisma-migrate-deploy
pnpm run prisma-generate

# Run in separate terminals
pnpm run dev:frontend
pnpm run dev:backend
pnpm run dev:orchestrator
```

Services: frontend `:4200`, backend `:3000`, worker health `:3002`, Postgres
`:5433`, Redis `:6380`, Temporal `:7233`, and Temporal UI `:8082`. Cold backend
and worker starts can take over a minute because the provider graph and Temporal
workflow bundle are large.

The credential-independent sandbox is enabled only when
`ENABLE_TEST_PROVIDER=true`. It publishes nowhere and must remain disabled in
production.

## Verification

```bash
pnpm run prisma-format
pnpm run prisma-validate
pnpm run prisma-migrate-status
pnpm run test:unit
pnpm run test:integration       # requires the local stack + backend
pnpm run build
docker compose --env-file .env.production -f deploy/compose.production.yaml config
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
- [Security](docs/SECURITY.md)
- [Backups](docs/BACKUPS.md) and [disaster recovery](docs/DISASTER_RECOVERY.md)
- [Platform integrations](docs/PLATFORM_INTEGRATIONS.md)
- [Public API](docs/API.md)
- [Webhooks](docs/WEBHOOKS.md)
- [n8n, Make, and MCP distribution](docs/DISTRIBUTION.md)
- [Platform approval package](docs/platform-approval/README.md)
- [Brand system and name-clearance warning](docs/BRAND.md)
- [Upstream audit](docs/AUDIT.md)

## License

Publishly is a modified Postiz distribution under AGPL-3.0. Commercial hosting
and modification are permitted, but operators must preserve notices and offer
the corresponding source of the running modified version to network users under
AGPL section 13. See [LICENSE](LICENSE),
[LICENSE-COMPLIANCE.md](LICENSE-COMPLIANCE.md), and the public `/source` page.
