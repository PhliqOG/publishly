# Publishly architecture

## Runtime topology

```text
Browser / customer API
        |
   Caddy or load balancer (HTTPS, /api -> backend)
        |--------------------|
   Next.js frontend      NestJS backend
                              |
              PostgreSQL -- Redis -- S3-compatible storage
                              |
                       Temporal cluster
                              |
                    Orchestrator workers
                              |
                       Official provider APIs
```

`apps/frontend` contains the authenticated product and public marketing route
groups. `apps/backend` owns HTTP authentication, authorization, validation,
billing, public API, uploads, and workflow creation. `apps/orchestrator` owns
Temporal workflows and provider activities; browsers never keep a schedule
alive. Shared Prisma/services/providers live in `libraries/nestjs-libraries`.

## Tenant and authorization boundary

`Organization` is the tenant. `UserOrganization` is the membership and stores
`SUPERADMIN` (workspace owner), `ADMIN`, or `USER`. The authentication
middleware verifies the signed session, reloads the user, intersects the
requested `showorg` value with active memberships, and attaches the resulting
user/workspace to the request. Policies are evaluated independently of billing:

- owner: destructive workspace actions and ownership transfer;
- owner/admin: channels, team administration, API keys, webhooks, billing, and
  workspace settings;
- member: normal content work within the selected workspace;
- instance super-admin: operator pages and impersonation only.

Repository queries include `organizationId`; object IDs alone are not an
authorization boundary. Integration tests exercise cross-tenant IDs for API
keys, integrations, posts/jobs, webhooks, imports, and audit resources.

## Authentication and secret handling

- Local passwords use bcrypt. Email activation is required when an email
  provider is configured. Reset links are short-lived and single-use.
- The session JWT is stored in an HTTP-only secure cookie in production.
- OAuth state and verifier material are stored in Redis with a TTL and consumed
  on callback. Redirect targets are allow-listed.
- Provider tokens are sealed with AES-256-GCM under a key derived from
  `ENCRYPTION_SECRET` and opened only at provider call boundaries.
- Customer API keys contain 192 random bits, use a `pub_` prefix, are shown
  once, and are stored as SHA-256 hashes with scopes and revocation state.

## Provider layer

`SocialProvider` is the upstream adapter contract. Publishly adds a normalized,
conservative capability registry returned by both provider discovery and the
connected-channel list. A flag is true only when the adapter and composer path
implement it. Platform-specific composer panels consume the same connected
channel record, and the backend performs final media/content validation.

Provider credentials are registered in `provider.env.registry.ts`. Missing
groups do not prevent credential-independent boot; they render disabled and
produce actionable configuration warnings. Partial groups are invalid, and
`CONFIG_STRICT=true` makes invalid production configuration fail startup.

## Publishing semantics

Every destination is its own `Post`; a shared `group` joins a multi-network
composition. This preserves successful destinations when another fails. Every
post has one `PublishingJob` with a unique `postId` and idempotency key and one
of:

`DRAFT -> SCHEDULED -> QUEUED -> PROCESSING -> PUBLISHED`

or `RETRYING`, `PARTIAL_SUCCESS`, `FAILED`, `CANCELLED` as appropriate.

Temporal workflow IDs are based on the post ID. Workflow timers survive browser
and application restarts. The worker uses provider-specific task queues and
concurrency caps. Publishing safety is intentionally at-most-once for unknown
mutation outcomes:

- an adapter may mark a failure `ProviderTransient` only when it knows no
  publish request reached the provider; those failures retry with backoff;
- token refresh is recoverable and reseals the replacement token;
- provider polling/status reads may retry;
- a timeout, connection loss, or exception after a publish request may have
  succeeded remotely, so it is categorized `outcome_unknown`, recorded in the
  job ledger, and never automatically replayed;
- successful sibling destinations remain published and only safe failed
  destinations retry.

This avoids duplicate customer posts. Operators reconcile an ambiguous outcome
using the provider account and job details before choosing any manual retry.

## Bulk work

CSV upload creates a tenant-scoped `BulkImport` preview with bounded parsing and
row validation. Commit starts `bulkImportWorkflowV101`; worker activities process
rows in checkpoints, update progress, and produce a downloadable CSV error
report. Large imports do not hold the HTTP request open. Bulk date shifts and
cancel/delete actions use tenant-scoped IDs.

Bulk Scheduler is a separate, native media path. Immutable `BulkCampaignIntent`
rows capture exact tuple selection and local scheduling intent. Resumable
`BulkUploadSession`/`BulkUploadPart` rows own private chunks; workers stream
validation, normalization, thumbnailing, hashing, and per-file quarantine.
`BulkCampaignJob` is the database source of truth for deterministic expansion,
UTC/local/DST slot intent, state, and classified outcome. Planning and
reservation use bounded chunks/keyset pages; queues contain only claims.

Every campaign slot is a `CalendarReservation` with owner type
`BULK_CAMPAIGN_SLOT`. A short-horizon materializer claims rows with
`FOR UPDATE SKIP LOCKED`, creates normal Posts through `PostsService`, attaches
the private asset to the resulting `PublishingJob`, and starts only
`postWorkflowV109`. Provider URLs are short-lived job capabilities and never
persist in Post or workflow history. `PublishingAttempt` records mutation before
invocation and forces provider readback after an ambiguous timeout. Absence must
be proven before retry; otherwise the item becomes `NEEDS_REVIEW`.

## Media pipeline

Media bytes live in local development storage or a generic S3-compatible
bucket, never in Postgres. Database rows store safe names, MIME type, size,
dimensions/duration, SHA-256, thumbnail, and metadata state. The pipeline:

1. enforces plan quota and bounded request/import sizes;
2. sniffs bytes instead of trusting filename or browser MIME;
3. computes SHA-256 and reuses an exact same-tenant object;
4. extracts dimensions/duration and generates a thumbnail with Sharp/FFmpeg;
5. skips unnecessary destination transcoding;
6. supports signed single-part and multipart S3 upload;
7. soft-deletes and later removes retained/orphaned objects under a Redis lock.

Remote URL ingestion validates every redirect and uses DNS-pinned SSRF-safe
connections that reject loopback, private, link-local, and metadata targets.

## Analytics and inbox

Analytics endpoints return only provider-reported values. Redis caches reduce
API pressure; request-time snapshots are upserted by integration/day/label and
pruned according to the server-side plan retention. Provider/API omissions are
represented as unavailable, never synthesized.

The unified inbox normalizes adapter comments and adds tenant-local workflow
state (`InboxState`): read, resolved, assignee, internal note. Reply is exposed
only when the provider implements an authorized official reply adapter.

## Billing, metering, and webhooks

Stripe Checkout and Portal are created server-side. Stripe webhook signatures
are checked against the raw body and event IDs are claimed in
`ProcessedWebhookEvent`, making replay idempotent. Entitlements are resolved
from `pricing.ts` plus validated `PRICING_OVERRIDES_JSON`; client tier state is
never trusted. Price, successful-post allowance, reliability entitlements, and
paid unlimited-account policy are locked invariants rather than deploy-time
overrides.

`SuccessfulPostUsage` is append-only billing evidence. The confirmed-live
receipt transaction upserts one row per destination; every other delivery state
is unmetered. The ledger intentionally has no Post foreign key, so deleting
operational content cannot rewrite past usage. Monthly quota authorization
counts this ledger inside a UTC subscription-anniversary window.

Outgoing customer webhooks use a per-hook encrypted signing secret and stable
event ID. Each attempt records status/code/duration. Signatures cover the raw
body and timestamp. Destinations pass the same DNS-pinned SSRF protection used
by media imports.

## Important data models

| Model                                      | Purpose                                                 |
| ------------------------------------------ | ------------------------------------------------------- |
| `User`, `Organization`, `UserOrganization` | identity, tenant, membership/role                       |
| `Integration`                              | connected provider account and sealed authorization     |
| `Post`, `PublishingJob`                    | per-destination content and operational delivery ledger |
| `SuccessfulPostUsage`                      | deletion-resistant confirmed-live billing ledger        |
| `Media`                                    | object metadata, hash, dimensions, retention state      |
| `AnalyticsSnapshot`                        | tenant/provider historical metric snapshots             |
| `InboxState`                               | local workflow state for normalized comments            |
| `BulkImport`                               | asynchronous import progress and row report             |
| `Subscription`, `Customer`                 | Stripe-derived billing state                            |
| `ApiKey`                                   | hashed scoped customer key                              |
| `Webhooks`, `WebhookDeliveryAttempt`       | signed outbound hook and attempt log                    |
| `ProcessedWebhookEvent`                    | inbound webhook replay ledger                           |
| `AuditLog`                                 | tenant security/action trail                            |
| `MetaDataDeletionRequest`                  | opaque Meta deletion confirmation/status record         |

Six checked-in Prisma migrations establish the Publishly baseline and additive
features. Production uses `prisma migrate deploy`; it never uses destructive
`db push` or resets.

## Upstream update path

The `upstream` remote points to Postiz and tag `upstream-baseline-20260809`
marks the fork point. Keep new Publishly services/pages isolated, preserve old
Temporal workflow versions, and merge a reviewed upstream tag into a branch:

```bash
git fetch upstream --tags
git checkout -b chore/upstream-YYYYMMDD
git merge <reviewed-upstream-tag-or-commit>
```

Resolve shared seams (provider manager, auth middleware, Prisma schema,
publishing activities, brand copy), run migrations and the full verification
matrix, then canary the test provider before any real provider.
