# Security

This document describes controls implemented in this tree and deployment work
the operator must still own. It is not a certification or penetration-test
report.

## Identity, sessions, and recovery

- Passwords are hashed with bcrypt. Local registration requires activation
  whenever transactional email is configured.
- Reset tokens expire after 20 minutes and carry a `jti` consumed by one atomic
  database update; a link cannot be reused and a newer link supersedes it.
- Production session cookies are secure and HTTP-only. Unsafe cookie-authenticated
  requests require an `Origin` matching `FRONTEND_URL` or `MAIN_URL`, providing
  the CSRF boundary even though cross-site OAuth requires `SameSite=None`.
- Authentication reloads the database user and active workspace membership;
  JWT role/admin/activation claims are not trusted.
- Owner, admin, member, and instance-super-admin checks are independent of plan
  entitlement checks. Ownership transfer is transactional, and the owner cannot
  be removed before transfer.

## Tenant isolation and IDOR

The active `Organization` is derived from an authenticated membership. Critical
repositories require `organizationId` in reads and mutations, and policy guards
protect administrative endpoints. Real integration tests submit tenant A's IDs
under tenant B for integrations, webhooks, API keys, audit/import resources,
posts, and publishing jobs and expect denial/not-found.

Any new route accepting a resource ID must add the tenant predicate in the
database query—not fetch globally and compare only in the browser. Add it to the
cross-tenant test matrix before merging.

## Provider credentials and API keys

- Social access/refresh/custom credentials are sealed with AES-256-GCM, random
  nonce, and authenticated tag under an HKDF-derived key from
  `ENCRYPTION_SECRET` (fallback to `JWT_SECRET` exists for compatibility but is
  not recommended). Plaintext is opened only at provider call seams.
- Temporal payloads retain sealed rows; activities create an opened in-memory
  copy when needed. Logs/admin responses omit credentials.
- New customer keys are `pub_` values with 192 random bits, shown once and
  stored only as SHA-256 hashes. They are tenant-owned, scoped, revocable, and
  have last-used metadata.
- Reversible legacy workspace keys are disabled unless
  `ALLOW_LEGACY_API_KEYS=true`; new deployments must leave it false.
- `ENCRYPTION_SECRET` rotation needs a key-ring/reseal migration or channel
  reconnect. Do not rotate it blindly.

## OAuth and redirects

Connect state and verifier values live in Redis with TTL and are consumed on
callback. Callback providers are allow-listed by the integration manager.
Return URLs accept local paths, configured origins, or the configured mobile
scheme; protocol-relative, JavaScript, and arbitrary external redirects are
rejected unless a narrowly scoped enterprise flow explicitly permits external
HTTPS.

Some providers do not implement PKCE but still use server-held state because
their official flow/app type does not support the same PKCE mechanism. Client
secrets never enter the frontend bundle.

## Request, browser, and injection controls

- Global DTO transformation/validation and Prisma parameterization prevent
  common malformed-input and SQL-injection paths. There is no user-composed SQL
  in the Publishly additions.
- Backend and frontend emit `nosniff`, clickjacking denial, referrer, and
  permissions headers. Frontend CSP currently establishes `base-uri`,
  `object-src`, and `frame-ancestors`; a nonce-based script/style CSP should be
  staged before tightening further because the editor/preview stack uses
  runtime styles.
- React escapes normal content. Explicit HTML previews must remain behind the
  existing sanitizer; never render provider/user HTML directly.
- Every request receives/returns a validated `X-Request-ID`. Structured logs
  include method/path/status/duration and workspace context, not query strings,
  cookies, authorization headers, keys, or OAuth tokens.

## SSRF and uploads

Remote media and webhook destinations allow public HTTP(S) only, resolve DNS,
reject private/loopback/link-local/metadata networks, pin the validated address,
and revalidate each redirect. Size/time limits bound downloads and responses.
`DISABLE_SSRF_PROTECTION` is a trusted-network escape hatch and must not be used
in public production.

Uploads enforce plan quota and size, sanitize names/keys, sniff bytes rather
than trusting extensions, accept supported media MIME only, and store bytes in
object storage. Local-storage deletion resolves and verifies the target inside
the configured root. FFmpeg/Sharp operate on controlled temporary paths.

## Publishing safety

Provider mutations do not use blanket retry. Only a typed pre-request transient
failure may retry; timeouts and exceptions with uncertain remote outcome become
`outcome_unknown` and fail closed. The `PublishingJob` ledger, unique post/job
IDs, Temporal workflow IDs, provider-aware queues, and destination-level rows
prevent sibling success from being corrupted. Operators must inspect the
provider before manually replaying an ambiguous job.

## Webhooks and billing

- Stripe verifies the raw-body signature with `STRIPE_SIGNING_KEY` and claims
  `event.id` in a replay ledger. A handler failure releases the claim for
  Stripe's legitimate redelivery.
- Outgoing customer webhooks have encrypted per-hook secrets, stable event IDs,
  timestamped HMAC-SHA256 signatures, bounded delivery attempts, and an attempt
  ledger. Rotation shows the replacement secret once.
- Meta data deletion verifies `signed_request` with the matching app secret
  using constant-time HMAC comparison. Replays produce the same opaque
  confirmation, credentials/provider-derived data are erased, pending jobs are
  cancelled, and raw Meta user IDs are not stored in the request ledger.

## Data export and deletion

- `GET /settings/export` is admin-only and excludes token/key secret material.
- `DELETE /settings/organization` is owner-only; credentials are destroyed,
  keys revoked, content soft-deleted, and memberships disabled.
- Individual channel disconnect destroys the stored authorization.
- Meta's public callback is `POST /public/meta/data-deletion`; the human status
  page is `/data-deletion`.

## Rate limiting and edge controls

The customer API is Redis-throttled per workspace and operation bucket. The
application's login/reset/dashboard endpoints intentionally rely on edge/WAF
limits and are not covered by the in-app public-API guard. Configure stricter
per-IP limits for `/api/auth/login`, `/api/auth/forgot`, registration, OAuth
starts/callbacks, uploads, Meta deletion, and Stripe endpoints without blocking
provider IP ranges or legitimate webhook retries.

## Operator requirements and residual risk

- Use a secret manager, least-privilege database/S3 principals, MFA, encrypted
  backups, dependency scanning, and a private operations network.
- Never expose Postgres, Redis, Temporal, Elasticsearch, or Temporal UI to the
  public internet.
- Legal pages are operator templates and require counsel, controller identity,
  jurisdiction, retention, subprocessors, and DPA completion.
- Provider response/error bodies can contain customer/provider data; restrict
  database/admin/log access and apply retention.
- Complete an independent penetration test and privacy review before accepting
  paid customers. Re-run after auth, upload, webhook, billing, or tenant-boundary
  changes.

## Dependency review

The lockfile is scanned with OSV-Scanner v2.4.0. `osv-scanner.toml` contains
time-bounded, documented reachability exceptions rather than permanent blanket
suppression. The reviewed scan has no unmitigated critical or high findings.

The 2026-08-11 npm-registry audit reports zero critical findings and four high
dependency occurrences, all belonging to the two `image-size` loop advisories
below. Registry audits identify versions and cannot account for pnpm's applied
source patches. Both installed 1.2.1 and 2.0.2 copies were separately checked
with a malformed zero-length ICNS entry and rejected it immediately. Keep both
the lockfile patch hashes and the time-bounded OSV review; do not waive a future
high advisory merely because these two are mitigated.

`image-size` 1.2.1 and 2.0.2 currently have no upstream fixed release for two
zero-length parser-loop advisories. Publishly applies the reproducible patches
in `patches/`, rejects undersized boxes/ICNS entries, and does not accept ICNS,
JXL, or HEIF uploads. The UUID exception is limited to transitive versions where
the affected v3/v5/v6 output-buffer overloads are not called; Publishly uses
UUID 14 directly. All exceptions expire on 2026-09-10 so CI/operator review
cannot silently treat them as permanent.

The current reviewed report contains three moderate and six low advisory
instances across eight constrained transitive packages in AI, editor, crypto,
and HTTP-server dependency trees. Review them on every lockfile change and
remove an exception or dependency patch as soon as an upstream fixed release
is available.

Report vulnerabilities privately to the operator's published security contact;
do not include secrets or customer data in an initial report.
