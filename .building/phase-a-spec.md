# Phase A spec — foundations (config, health, capability, test provider, test harness)

Rule of engagement: follow upstream layering (DTO→Controller→Service→Repository), additive
modules over edits, no provider-specific logic in generic code, pnpm only, no raw SQL.

## A1. Config validation upgrade (extend, don't replace)
- Extend `libraries/helpers/src/configuration/configuration.checker.ts`:
  - JWT_SECRET strength check (>=32 chars, not the .env.example placeholder text).
  - Per-provider credential completeness: a provider is "configured" iff ALL its env vars
    are non-empty (registry in A3). Partial config (one of two keys) → explicit issue.
  - Stripe triple (publishable+secret+signing) all-or-nothing check; storage provider
    fields check when STORAGE_PROVIDER=cloudflare; email provider completeness.
  - `CONFIG_STRICT=true` → `check()` issues become fatal (process exit 1) for prod.
    Default stays warn-only (upstream behavior preserved).
- Backend main.ts already calls it post-listen; add same call to orchestrator main.

## A2. Health endpoints (backend)
- New `apps/backend/src/api/routes/health.controller.ts`: `GET /health` →
  `{ status, checks: { database (SELECT 1 via prisma), redis (PING via ioredis), temporal (optional describeNamespace with 2s timeout) }, version }`.
  200 when db+redis ok; 503 otherwise. No auth (infra probe), no secrets in output.
- Wire into app.module. Orchestrator `/health/status` already exists (verified).

## A3. Provider configuration registry + capability endpoint
- New `libraries/nestjs-libraries/src/integrations/provider.env.registry.ts`:
  map identifier → required env var names (from each provider's code, e.g. facebook →
  [FACEBOOK_APP_ID, FACEBOOK_APP_SECRET]; bluesky → []; mastodon → [MASTODON_CLIENT_ID,
  MASTODON_CLIENT_SECRET] (URL defaults); wordpress/custom → []). Single source of truth
  used by ConfigurationChecker AND the API.
- `IntegrationManager.getAllIntegrations()` gains per-provider:
  `configured: boolean` (env-complete), `maxLength` (call with no settings; fallback null),
  so the UI can show honest "not configured on this server" disabled states + char limits.
- Frontend: connect dialog marks unconfigured providers disabled with tooltip
  "Provider not configured — see docs/platform-approval/<id>.md" (no fake availability).

## A4. Crypto v2 + encryption at rest (design; implemented in security phase)
- `libraries/helpers/src/auth/crypto.v2.ts`: AES-256-GCM, key = HKDF(SHA-256, secret:
  ENCRYPTION_SECRET || JWT_SECRET, salt static app tag, info 'publishly-at-rest-v2'),
  random 12-byte IV, output `v2:<iv b64>:<tag b64>:<ct b64>`.
- `sealed()`/`open()`: open() accepts `v2:` format, else falls back to legacy
  fixedDecryption, else returns input unchanged (plaintext legacy rows) → lazy migration:
  every write re-seals as v2. No downtime, no bulk migration required (but a
  `commands` script offers bulk re-encrypt).
- Apply at Integration repository boundary (token/refreshToken/customInstanceDetails),
  third-party keys, OAuth app secrets. API keys move to hashes instead (A5).
- New env: ENCRYPTION_SECRET (optional; falls back to JWT_SECRET with startup warning).

## A5. Public API keys — hashed + scoped (security phase)
- Schema: Organization.apiKey stays (legacy); new model ApiKey { id, organizationId,
  name, prefix (first 8 chars, display), hash (sha256 of full key), scopes String[],
  lastUsedAt, revokedAt, createdAt }.
- Key format `pub_<32 random>`; shown once at creation. Middleware: exact-match legacy
  path preserved; new path hashes presented key and looks up by hash (indexed),
  checks revokedAt, stamps lastUsedAt (throttled). Scopes enforced per public route
  group (posts:read, posts:write, media:write, integrations:read, analytics:read).
- Public callers get role USER + explicit scope set (no synthetic SUPERADMIN).

## A6. Stripe webhook replay-safety (billing phase)
- Schema: ProcessedWebhookEvent { id (event.id, pk), source ('stripe'), type,
  processedAt }. Controller: after signature verify, `create` inside try; on P2002
  (duplicate) → return {ok:true, duplicate:true} without side effects. Retention: 30d
  cleanup in cron. Applies to both /stripe and connect webhook if enabled.

## A7. Single-use password reset (tenant phase)
- Add `jti` (random) into forgot-JWT + `User.resetCode` column storing current jti;
  /forgot-return verifies jti matches then clears it. Old links die on use or new request.

## A8. Test provider (publishing phase, dev/test only)
- `testprovider.provider.ts` implementing full SocialProvider contract: identifier
  'testprovider'; generateAuthUrl → `${FRONTEND_URL}/integrations/social/testprovider?state=...`
  (self-resolving, no external call); authenticate → deterministic account
  (id 'test-account-<hash of code>'); post() returns success postId/releaseURL and
  increments an in-memory + optional file sink counter (TEST_PROVIDER_SINK=<path>) so
  tests can assert exactly-once; optional TEST_PROVIDER_MODE=pending exercises
  postPending→checkPostStatus→finalizePost; TEST_PROVIDER_FAIL_TIMES=n fails first n
  post() calls (retry tests).
- Registered in socialIntegrationList ONLY when ENABLE_TEST_PROVIDER=true. Never in
  prod defaults. .env.example documents it as dev/test tooling.

## A9. Test harness
- Jest projects: `libraries/nestjs-libraries` unit+integration, `apps/backend` API tests.
- Test DB: publishly-test-db on same PG (prisma db push before suite via globalSetup;
  connection from TEST_DATABASE_URL). Unique-id data per test (no truncation, parallel-safe).
- API tests: Nest createTestingModule w/ real AppModule, supertest; cookies from real
  /auth/register. Isolation suite: two orgs, cross-access every core resource type,
  expect 404/403 — posts, integrations, media, webhooks, sets, api-keys, billing.
- Publishing suite: @temporalio/testing (add devDep) TestWorkflowEnvironment +
  in-test Worker running real postWorkflowV106 activities impl pointed at test provider;
  assert exactly-once under: happy path, transient provider failure, worker crash
  (terminate+resweep), duplicate-start (workflowId conflict), pending finalize path.
- Billing suite: constructEvent with stripe CLI-style signed payloads (stripe lib can
  sign with a test secret) → replay same event.id twice → second is a no-op.
- CI entry: `pnpm run test` (root, jest --coverage), plus `pnpm run test:integration`
  gated on DATABASE/REDIS/TEMPORAL availability (skips cleanly with message if down).
