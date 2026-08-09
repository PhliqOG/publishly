# Security

What is actually implemented in this tree, stated precisely — plus the gaps we
know about. Verify claims against the referenced files; report vulnerabilities
privately before disclosure.

## Authentication & accounts

- Passwords: bcrypt cost 10 (`libraries/helpers/src/auth/auth.service.ts`).
- Sessions: JWT in the `auth` cookie. `AuthMiddleware` verifies the signature
  and **re-loads the user from the database** — token claims are never trusted
  for identity, role, or org membership.
- Organization resolution intersects the requested `showorg` with the user's
  real memberships; role checks (`Sections.ADMIN` policies) gate admin
  endpoints; `User.isSuperAdmin` gates instance admin + impersonation.
- Password reset: 20-minute JWT that also carries a `jti` stored on the user;
  consumption is a single atomic conditional update
  (`users.repository.consumeResetCode`) — links die on first use or when a
  newer link is issued.
- Registration can be closed (`DISABLE_REGISTRATION=true`); email activation
  is enforced whenever an email provider is configured.

## Tenant isolation

- Every repository query filters by `organizationId`; ids are never accepted
  from the client without that scope.
- Enforced by tests: `test/integration/tenant.isolation.int.spec.ts` runs a
  cross-tenant IDOR matrix (webhooks, integrations, api keys, audit logs, bulk
  imports, public API) against the real running API.

## Social tokens at rest

- Sealed with AES-256-GCM (random IV, authenticated) under a key derived via
  HKDF-SHA256 from `ENCRYPTION_SECRET` (fallback `JWT_SECRET` — set the
  dedicated secret in production). Format `v2:iv:tag:ct`
  (`libraries/helpers/src/auth/crypto.v2.ts`).
- Seal-on-write at the integration repository; open-at-use at every provider
  seam. Temporal activities receive sealed rows and open in-memory copies
  (`withOpenToken`) so plaintext tokens do not persist into workflow history.
- Legacy rows (plaintext or the old CBC format) keep working via `open()`'s
  fallback and re-seal on their next write. **Rotation caveat:** changing
  `ENCRYPTION_SECRET` invalidates sealed values (no key ring yet) — rotate by
  forcing channel reconnects or writing a re-seal script first.

## Public API keys

- `pub_`-prefixed, 192-bit random, shown exactly once; only the SHA-256 hash
  and a display prefix are stored (`ApiKey` model). Lookup is by hash;
  revocation is immediate; last-used is stamped (throttled).
- Scopes enforced deny-by-default in `public.auth.middleware.ts`: unlisted
  routes require the `*` scope, so a narrow key can never reach endpoints
  added after it was minted.
- Public-API requests get role `ADMIN` (not SUPERADMIN) on a synthetic
  membership.
- **Known gap:** the legacy `Organization.apiKey` path still authenticates for
  backward compatibility, and legacy keys are stored with a reversible cipher
  (upstream's static-IV AES-CBC). Recommendation: mint `pub_` keys and treat
  legacy keys as deprecated; removal is a one-line change in the middleware.

## OAuth connect flows

- Per-connect `state` + PKCE `codeVerifier` (where platforms support it) are
  held server-side in Redis with a 1-hour TTL, keyed by state — nothing
  user-supplied is trusted on callback.
- Outbound requests with user-influenced URLs (self-hosted instances, media
  fetches) go through an SSRF-safe dispatcher blocking
  private/loopback/link-local targets (`DISABLE_SSRF_PROTECTION` exists for
  trusted-network installs; leave it off).

## Billing

- Stripe webhooks: signature verification against `STRIPE_SIGNING_KEY` on the
  raw body, then a replay ledger (`ProcessedWebhookEvent`) claims each
  `event.id` exactly once; a failed handler releases its claim so Stripe's
  redelivery can retry. Ledger rows are prunable after 30 days
  (`WebhookEventLedgerService.cleanup`).
- Prices are resolved server-side from Stripe by lookup key; entitlements come
  from server config (`pricing.ts` + `PRICING_OVERRIDES_JSON`) and are
  enforced by CASL policies — client-side state is display only.

## Rate limiting

- All `/public/v1` routes are throttled per organization (Redis-backed),
  `API_LIMIT` per hour per bucket (`posts` / `read` / `write`).
- **Known gap:** dashboard (cookie-auth) routes and the auth endpoints are not
  rate-limited beyond infrastructure defaults; add proxy-level limits for
  `/auth/*` in production.

## Audit log

- Org-scoped `AuditLog` (who/what/when/ip/user-agent), admin-visible in
  Settings. Covered actions tonight: team member invited/removed, integration
  enabled/disabled/deleted, api-key created/revoked, bulk import
  created/committed, bulk shift/delete, inbox replies, org data export,
  org deletion request.
- Writes are fire-and-forget by design: an audit failure logs a warning and
  never blocks or reverses the audited action.

## Data export & deletion

- `GET /settings/export` (org admin): full workspace export **excluding
  secrets** — connection tokens are excluded by construction.
- `DELETE /settings/organization` (org admin): destroys stored credentials
  immediately, soft-deletes content, disables memberships.

## Other known gaps (honest list)

- Secrets live in `.env` files; use a secret manager / injected env in
  production.
- Legal pages (`/terms`, `/privacy`) are drafts requiring counsel.
- No CSP/security-header hardening pass on the Next frontend yet.
- Temporal UI (:8082) and the dev compose have no auth — never expose them
  publicly.
- The `Errors` table stores provider response bodies for debugging; treat DB
  access accordingly.
