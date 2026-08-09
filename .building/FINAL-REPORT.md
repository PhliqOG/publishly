# Publishly — Overnight Build: Final Report

Repo: `Desktop/publishly` · upstream Postiz @7d08f5b6 (remote `upstream`, tag
`upstream-baseline-20260809`) · checkpoints: 309994c0 → dc0ae6c9 → 3f518100 → 54c28dc0

## COMPLETED

**Audit & license** — Full upstream audit (docs/AUDIT.md). AGPL-3.0 verified, commercial
SaaS permitted; obligations documented (LICENSE-COMPLIANCE.md) + /source page in-product.

**Fixed upstream** — bluesky.provider TS break (blocked all compiles) via typed union narrowing.

**Multi-tenant core hardening**
- Single-use password resets (atomic jti consume; was replayable 20-min JWT).
- Audit log: model + service + org-scoped viewer (settings tab) + events for team
  invite/remove, integration enable/disable/delete, api-key create/revoke, bulk ops,
  inbox replies, export/deletion.
- Workspace export (GET /settings/export — secret-free by construction) and deletion
  (DELETE /settings/organization — tokens destroyed immediately, keys revoked, content
  soft-deleted, memberships disabled).
- Tenant isolation verified by an IDOR test matrix against the live API.

**Security**
- At-rest encryption v2: AES-256-GCM (HKDF from ENCRYPTION_SECRET||JWT_SECRET, random IV,
  versioned format) for social tokens; sealed on repository writes, opened just-in-time at
  every provider seam (incl. object copies inside Temporal activities so plaintext never
  enters workflow history). Legacy rows lazily migrate.
- Public API keys re-founded: hashed (SHA-256) scoped `pub_` keys, shown once, deny-by-default
  scope map, per-org rate limits across ALL public routes; legacy key path kept for compat.
- Stripe webhooks replay-safe (event-id ledger, claim/release, redelivery-friendly).
- Config validation: secret strength, per-provider all-or-nothing creds, storage/Stripe
  groups, CONFIG_STRICT=true fail-fast for prod. Committed-secrets scan: clean.

**Product**
- Test provider (ENABLE_TEST_PROVIDER only): full lifecycle incl. pending→finalize,
  fail-injection, exactly-once sink; inbox implementation; enables demos + E2E without creds.
- Capability registry: configured/missingEnv/maxLength/supportsInbox per provider; UI shows
  honest disabled states for unconfigured providers.
- CSV bulk import: RFC4180 parser, validate→preview→commit lifecycle, per-row error report,
  progress polling; bulk shift/delete endpoints. 
- Analytics: daily snapshots (AnalyticsSnapshot) + /analytics/history; platform-reported
  values only, absent days never interpolated.
- Inbox framework: listComments/replyToComment capabilities, /inbox endpoints, UI + nav,
  capability-gated with honest unsupported states. Real-network adapters deliberately
  post-canary (nothing to verify against without credentials).
- Backend /health (DB+Redis), orchestrator /health/status (Temporal), admin /admin/system
  (dependencies, provider config/queues, subscription counts, read-only flags).
- Billing: existing Stripe core (checkout, portal, 7-day trials) + replay safety +
  4-plan entitlements overridable via PRICING_OVERRIDES_JSON (validated, bundle-safe).

**Brand & marketing**
- Full in-app rebrand to Publishly (env-overridable): original logo/lockup, all title/UI
  strings, honesty fixes (removed upstream's unverifiable user-count claims/testimonials),
  API-keys + audit-log settings tabs.
- Marketing site (isolated route group + mk-* design system, one-file copy config):
  departures-board signature hero (split-flap statuses, reduced-motion safe), features/
  pricing (from real entitlement config)/security/terms/privacy/source; public routing
  carved out; draft legal pages clearly marked for counsel.

**Docs** — README, ARCHITECTURE (incl. fork-divergence + merge strategy), DEPLOYMENT,
SECURITY, OPERATIONS, API; complete .env.example; docs/platform-approval/ (12 runbooks:
scopes-from-code, redirect URIs, review prerequisites, truthful use-case text, canaries).

**Dev infra** — docker-compose.publishly.dev.yaml (PG 5433/Redis 6380/Temporal 7233 + ES/
UI 8082); isolated Node 22 + pnpm 10 toolchain; jest rebuilt (upstream's config imported a
missing package); Windows-safe run regime documented.

## TEST RESULTS — all green
- Unit: **27/27** (run twice) — crypto v2 (roundtrip, tamper detection, legacy decrypt,
  hex-lookalike guard, key hashing), CSV parser edge cases, pricing override validation,
  provider env registry.
- Integration vs the LIVE API: **17/17** — tenant-isolation IDOR matrix (7: webhooks,
  integrations, api-keys, audit logs, bulk imports, public API, distinct orgs), api-key
  lifecycle (6: hash-only storage, validate, revoke, cross-org revoke denial, scope
  fallback, scope map incl. deny-by-default), webhook replay ledger (4: exactly-once
  claim, 8-way race → single winner, release-for-retry, cleanup).
- **E2E scheduling via test provider: PASS** — register → connect → schedule through the
  real composer API → Temporal workflow → worker publish → Post PUBLISHED with releaseURL,
  **exactly-once delivery confirmed via the provider sink**.
- Inbox smoke: PASS (capability listing, comment fetch, authorized reply).
- Runtime health at close: backend {ok, db+redis}, orchestrator {ok} with provider task
  queues RUNNING, frontend 200 (marketing + app), Temporal UI on 8082, ES green.
- Committed-secrets scan: clean.

**Not exercised (honest):** production `next build`/`nest build` full-bundle pass for the
frontend (dev-server + clean full-graph typechecks only); Stripe test-mode E2E (no test
keys on the machine — replay logic is covered by ledger tests; paste keys and run
`pnpm run dev:stripe` tomorrow); real-provider posting (no credentials, by design);
browser-level UI E2E (API-level E2E only). Survived a mid-build machine restart —
recovery runbook proven and documented.

## DEPLOYMENT
docs/DEPLOYMENT.md. Key facts: orchestrator must be `nest build`-built (Temporal workflow
bundling); Temporal requires Elasticsearch visibility; CONFIG_STRICT=true in prod;
split-service stack recommended (frontend/backend/orchestrator/PG/Redis/Temporal+ES/S3).

## CREDENTIALS NEEDED (exact env vars — none exist in the repo today)
- Core prod: JWT_SECRET, ENCRYPTION_SECRET, DATABASE_URL, REDIS_URL, FRONTEND_URL,
  NEXT_PUBLIC_BACKEND_URL, BACKEND_INTERNAL_URL, MAIN_URL, TEMPORAL_ADDRESS
- Stripe: STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_SIGNING_KEY
  (+STRIPE_SIGNING_KEY_CONNECT if Connect) — plus Products/Prices with lookup keys per
  docs/DEPLOYMENT.md
- Storage (R2/S3): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY,
  CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKETNAME, CLOUDFLARE_BUCKET_URL
- Email: RESEND_API_KEY + EMAIL_FROM_ADDRESS/NAME (or EMAIL_PROVIDER=nodemailer + SMTP set)
- Socials: FACEBOOK_APP_ID/SECRET (FB+IG), INSTAGRAM_APP_ID/SECRET (standalone),
  THREADS_APP_ID/SECRET, TIKTOK_CLIENT_ID/SECRET, YOUTUBE_CLIENT_ID/SECRET,
  X_API_KEY/SECRET, LINKEDIN_CLIENT_ID/SECRET, PINTEREST_CLIENT_ID/SECRET; Bluesky none;
  MASTODON_CLIENT_ID/SECRET optional (defaults work per-instance)
- Optional: OPENAI_API_KEY, Sentry, short-linkers.

## PLATFORM APPROVALS (tomorrow) — docs/platform-approval/README.md sequencing
Flags found in code: YouTube requests restricted `youtubepartner` scope (trim before Google
review); LinkedIn member provider requests org scopes (gates approval); X needs paid API
tier for write; Meta data-deletion uses instructions-URL (no callback endpoint in code);
dev redirect wrappers (redirectmeto.com) must never reach prod app configs.

## BLOCKERS (external only)
- Platform credentials + app reviews (operator, tomorrow).
- Legal pages need counsel review (drafts shipped, clearly marked).
- Production domain/TLS/storage buckets.

## FIRST CANARY per provider
Same-day (no review): Bluesky (app password), Mastodon (per-instance app). Then per
approval: one private/test-account post via the normal composer, verify permalink +
calendar state, before any real brand account.
