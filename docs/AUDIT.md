# Publishly — Upstream Audit (Postiz @ 7d08f5b6, 2026-08-08)

Audited 2026-08-09 before any modification. Baseline tag: `upstream-baseline-20260809`,
upstream remote kept for merges. Verdict: **build on it** — the hard distributed-systems
core (publishing pipeline) and the provider fleet are mature; the productization layer
(tests, security hardening, billing safety, branding, marketing, admin depth) is ours to add.

## License

**AGPL-3.0, standard text, no custom terms** (verified from LICENSE + package.json).
Commercial hosted SaaS is permitted. Obligation: offer Corresponding Source to network
users (AGPL §13). Full analysis + operating rules: `LICENSE-COMPLIANCE.md`. Postiz
trademark not used in Publishly branding; upstream credited.

## Architecture

| Piece | Stack | Role |
|---|---|---|
| apps/backend | NestJS 11, port 3000 | REST API; layering DTO→Controller→(Manager)→Service→Repository |
| apps/orchestrator | NestJS + Temporal SDK, port 3002 | workflows/activities: publishing, emails, autopost, token refresh |
| apps/frontend | Next.js 16 + React 19, port 4200 | app UI (Tailwind 3, SWR, Mantine 5) |
| libraries/nestjs-libraries | shared | Prisma schema, repositories/services, 37 social providers, Stripe, email |
| libraries/helpers, react-shared-libraries | shared | auth crypto, fetch hooks, UI helpers |
| apps/commands, extension, sdk | aux | CLI, Chrome extension, public SDK |

Infra: Postgres (Prisma 6.5, `db push` — no migration files upstream), Redis (ioredis:
state cache, OAuth state, throttling), Temporal 1.28 (SQL visibility OK), storage local
or R2/S3 SDK, email via Resend or SMTP (nodemailer) with no-op fallback.

Repo conventions (upstream CLAUDE.md — we follow them): pnpm only; no raw SQL; provider
logic never leaks into generic code (extend the provider interface instead); Temporal
workflows/activities already on origin/main are immutable — version new ones; changes
must not break existing production users (safe migrations only).

## What exists and is mature (REUSE)

- **Auth**: email/password + activation email + resend, forgot/reset (JWT, 20-min TTL),
  OAuth login (GitHub, Google, Farcaster, Wallet, generic OIDC). `DISABLE_REGISTRATION`.
- **Multi-tenancy**: User↔Organization M:N with `Role` (SUPERADMIN/ADMIN/USER); org
  resolved in `AuthMiddleware` (re-loads user from DB — doesn't trust JWT claims), all
  repositories hard-filter `organizationId`. CASL enforces plan quotas (402 on exceed).
- **Publishing (Temporal)** — genuinely strong design:
  - `workflowId = post_${postId}` + TERMINATE_EXISTING ⇒ scheduling dedup/lock.
  - v106 workflow: publish activities max 3 attempts; the state-mutating pending/finalize
    proxy is **maximumAttempts: 1** so a crash can't double-post; `posted` flags guard
    republish; status-check errors are swallowed rather than re-entering publish.
  - Sweeper `missingPostWorkflow` re-pokes missed posts hourly (signalWithStart, USE_EXISTING).
  - Per-provider task queues with concurrency budgets from provider `maxConcurrentJob`.
  - Failures land in `Errors` table + in-app notification (no separate DLQ).
- **Providers**: 37 including all 10 required (IG (+standalone), FB, TikTok, YouTube, X,
  Threads, LinkedIn (+pages), Pinterest, Bluesky, Mastodon (+custom)). Interface exposes
  `maxLength`, `checkValidity` (media rules), `scopes`, editor type, custom fields,
  mentions; per-provider settings DTOs; per-provider frontend components.
- **Billing**: large Stripe service — tiers FREE/STANDARD/TEAM/PRO/ULTIMATE defined in
  `pricing.ts` with feature flags; embedded + hosted checkout; billing portal; 7-day
  trials (`allowTrial`); proration paths; signature-verified webhook (`rawBody`).
- **Composer/calendar/media**: full composer with per-platform settings/previews, tags,
  signatures, sets; calendar UI; media library with Uppy uploads (local/R2).
- **Analytics**: `analytics()` on ~11 providers, Redis read-through cache (per-day key),
  auto token-refresh + retry once; chart.js UI. Honest per-provider availability.
- **Email**: provider abstraction (Resend/SMTP/no-op); async sends via Temporal.
- **Admin**: `isSuperAdmin` + impersonation (cookie-scoped), errors/stats pages.
- **Public API v1**: upload, posts CRUD, integrations list, etc. under `/public/v1`.
- **Misc**: generic OIDC SSO, i18n, MCP server, OAuth-app provider (`pos_` tokens),
  webhooks with per-plan limits, autopost (RSS), marketplace/agency models (dormant).

## Gaps and defects (BUILD/FIX) — severity-ordered

1. **Zero automated tests** repo-wide (jest configured, unused). → Build harness + suites:
   tenant isolation/IDOR, auth, publishing idempotency, billing webhooks, bulk, API keys.
2. **Social tokens plaintext at rest** (`Integration.token/refreshToken`). → Encrypt
   (AES-256-GCM envelope, random IV, versioned prefix), lazy migration on read/write.
3. **Weak legacy crypto**: AES-256-CBC + MD5-EVP key + **static IV** for org API keys,
   third-party keys, OAuth app secrets. → New GCM primitive; migrate call sites.
4. **API keys stored recoverable + looked up by exact value**; sent bare in
   `Authorization`. Public-API callers get synthetic SUPERADMIN. → Hashed (SHA-256)
   scoped keys with display prefix, constant-time lookup by hash, scope model, migration.
5. **Stripe webhook: no replay/idempotency protection** (no `event.id` ledger). → 
   processed-events table + upsert guard; expand handled event set safely.
6. **Throttling only on one endpoint** (`POST /public/v1/posts`); all else unlimited. → 
   API-wide sensible limits (per-key/org), auth endpoints stricter.
7. **Password reset tokens are reusable** within 20 min (no nonce). → Single-use.
8. **No audit log** of who did what. → AuditLog model + service + admin/org UI surface.
9. **No unified inbox** (Comments model = internal team comments). → Capability-gated
   inbox core + adapters where official comment APIs exist.
10. **No CSV/bulk import**. → Async import (validate→preview→commit) + bulk ops.
11. **No marketing site** ('/' redirects into the app). → Original Publishly site.
12. **Branding hardcoded** ('Postiz'/'Gitroom' via IS_GENERAL; inline SVG logo). → 
    Central brand module + env override; replace all surfaces; rename doc.
13. **Backend has no real /health** (root returns static string; queue monitor is a stub).
    → Real health: DB/Redis/Temporal checks; orchestrator already has one.
14. **No startup config validation**. → Env schema validation with actionable errors;
    provider enable/disable derived from env presence (credential-independent boot).
15. **No analytics history** (Redis cache only). → Snapshot table for historical series.
16. **Data export/deletion** for orgs/users incomplete. → Export bundle + deletion flow.
17. Prisma uses `db push` (no migration files) upstream. → Adopt migrations going forward.
18. `SubscriptionTier` enum lacks FREE (code-only tier) — noted for entitlement work.
19. Docs minimal for operators. → Full docs suite + platform approval packages.

## Environment constraints (this machine)

- Windows 11; isolated toolchain at `~/.publishly-tools` (Node 22.23.2 + pnpm 10.6.1) —
  repo requires Node ≥22.12 <23; machine global is Node 25 (untouched).
- pnpm 10 required: `onlyBuiltDependencies=[bcrypt]` skips node-canvas native build
  (no Windows prebuilt for Node 22; nothing server-critical imports it eagerly — verify at boot).
- Dev infra: `docker-compose.publishly.dev.yaml` — Postgres 17 @5433, Redis @6380,
  Temporal @7233 (no Elasticsearch; SQL visibility), Temporal UI @8082. Ports chosen to
  avoid other local stacks (6379/5000/5678/9090 in use by unrelated projects).
- The missing `libraries/plugins` submodule (private upstream repo) is dormant — nothing
  imports it; safe to ignore.

## Update path (don't break upstream)

- `upstream` remote + `upstream-baseline-20260809` tag; merge upstream tags forward.
- Prefer additive modules over edits; where edits are needed, keep them small and
  documented in `docs/ARCHITECTURE.md` §Fork-divergence so merges stay tractable.
- Never edit deployed Temporal workflow files — add versioned workflows (upstream rule).
