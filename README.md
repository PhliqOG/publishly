# Publishly

Multi-tenant social media scheduling SaaS: one composer, ten networks over
official APIs, and a publishing pipeline that treats delivery like
infrastructure. Built on the open-source
[Postiz](https://github.com/gitroomhq/postiz-app) engine (AGPL-3.0) — see
[LICENSE](LICENSE) and [LICENSE-COMPLIANCE.md](LICENSE-COMPLIANCE.md) for what
that means for operators.

## What it does

- **Networks (official APIs/OAuth only):** Instagram, Facebook, TikTok,
  YouTube, X, Threads, LinkedIn (member + pages), Pinterest, Bluesky, Mastodon —
  plus ~20 more providers inherited from the engine. Providers without server
  credentials render as honestly disabled, never broken.
- **Publishing pipeline:** every post is a durable Temporal workflow
  (`post_<id>`), exactly-once by construction (non-retryable finalize phase),
  per-destination partial success, automatic token refresh, hourly sweeper for
  missed slots.
- **Composer & calendar:** per-network captions/settings with live previews and
  enforced platform limits, first comments, drafts, tags, saved channel sets;
  month/week/day calendar with drag-and-drop.
- **Bulk:** async CSV import with validation preview and per-row error report;
  bulk shift/delete.
- **Analytics:** platform-reported metrics only, cached in Redis and snapshotted
  daily to Postgres for history (`GET /analytics/history/:integration`).
  Unavailable metrics are labelled, never fabricated.
- **Inbox (framework):** capability-gated unified comments with authorized
  replies; live for the internal test provider, real-network adapters land
  after platform approvals.
- **Billing:** Stripe — FREE + 4 paid tiers with 7-day trials, customer portal,
  signature-verified webhooks with replay protection; entitlements are config
  (`PRICING_OVERRIDES_JSON`), enforced server-side.
- **Security:** social tokens encrypted at rest (AES-256-GCM), hashed scoped
  API keys, single-use password resets, per-workspace audit log, org-scoped
  queries with cross-tenant tests. Details in [docs/SECURITY.md](docs/SECURITY.md).
- **Marketing site:** served from `/` for logged-out visitors (route group
  `apps/frontend/src/app/(marketing)`), rebrandable from a single config.

## Quickstart (development)

Requirements: Node.js ≥22.12 <23, pnpm 10, Docker.

```bash
# 1. Infrastructure: Postgres :5433, Redis :6380, Temporal :7233 (+ES), UI :8082
docker compose -f docker-compose.publishly.dev.yaml up -d

# 2. Environment
cp .env.example .env    # dev defaults for the required block already match the compose file

# 3. Install + database
pnpm install
pnpm run prisma-db-push

# 4. Run
pnpm run dev:frontend       # Next.js on :4200
pnpm run dev:backend        # NestJS API on :3000
pnpm run dev:orchestrator   # Temporal worker + health on :3002
```

Windows note: `nest start --watch` is unreliable here (silent no-spawn after
failed first compiles, taskkill races). The proven flow on Windows is compile +
run split: `tsc -p tsconfig.build.json --watch` inside `apps/backend` for
feedback, and run the app from `dist` with
`dotenv -e ../../.env -- node -r tsconfig-paths/register --experimental-require-module ./dist/apps/backend/src/main.js`
(uses `tsconfig.runtime.json`). The orchestrator must be built with
`nest build` — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#build).

First backend boot takes 2–3 minutes (large import graph); `GET /health`
answers once it's up.

## Tests

```bash
pnpm run test:unit         # pure logic - no infrastructure needed
pnpm run test:integration  # needs the dev stack running (DB + backend on :3000);
                           # suites self-skip with a message when it's down
pnpm run test               # everything + coverage
```

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | system layout, pipeline semantics, data model, fork divergence from upstream |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | dev stack, production stack, build specifics, backups |
| [docs/SECURITY.md](docs/SECURITY.md) | implemented security posture + known gaps |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | runbooks: health, stuck posts, token errors, imports |
| [docs/API.md](docs/API.md) | public API: keys, scopes, rate limits, endpoints |
| [docs/platform-approval/](docs/platform-approval/README.md) | per-network app setup + review packages |
| [docs/AUDIT.md](docs/AUDIT.md) | the upstream audit this fork started from |

## License

AGPL-3.0. Publishly is a derivative of Postiz (© Nevo David and contributors).
Operators must offer the corresponding source to their network users —
[LICENSE-COMPLIANCE.md](LICENSE-COMPLIANCE.md) explains the obligations and the
`/source` page implements the offer.
