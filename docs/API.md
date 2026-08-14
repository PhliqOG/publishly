# Customer API

Base URL: `<public-backend>/public/v1` (reference deployment:
`https://app.example.com/api/public/v1`). Interactive OpenAPI documentation is
served at `<public-backend>/docs`.

## API keys

Workspace owners/admins create keys under Settings → API Keys. The plaintext
`pub_...` value is shown once. Publishly stores only its SHA-256 hash, display
prefix, scopes, creation/revocation timestamps, and throttled last-used time.

```http
Authorization: pub_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Do not add a `Bearer` prefix. Revoke a leaked key immediately. Legacy
`Organization.apiKey` values are rejected by default; `ALLOW_LEGACY_API_KEYS`
exists only for a time-boxed migration and must remain false for new
deployments. `pos_` OAuth-app access tokens remain a separate supported auth
mechanism.

When Stripe billing is enabled, the server also requires an active
subscription and a plan whose `public_api` entitlement is true. Browser/client
tier fields are never used for authorization.

## Scopes

| Scope                | Access                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `posts:read`         | post list, publishing status, slot discovery, channel groups        |
| `posts:write`        | create, schedule, update, or delete posts                           |
| `media:write`        | multipart upload and guarded upload-from-URL                        |
| `integrations:read`  | connected channels, provider metadata/settings                      |
| `integrations:write` | disconnect a channel                                                |
| `webhooks:read`      | list configured webhook endpoints                                  |
| `webhooks:write`     | create, remove, and rotate webhook endpoints                        |
| `analytics:read`     | account and post provider analytics                                 |
| `notifications:read` | workspace notifications                                             |
| `video:write`        | configured video-generation functions                               |
| `*`                  | all routes, including maintenance/tool routes not explicitly mapped |

Scope matching is deny-by-default: a future/unmapped route requires `*`, so a
narrow key never silently gains new access.

Official n8n and Make adapter source, MCP endpoints/tools, adapter-specific
scope requirements, and release status are documented in
[DISTRIBUTION.md](./DISTRIBUTION.md). Webhook receivers must follow the
canonical [WEBHOOKS.md](./WEBHOOKS.md) contract.

## Rate limits and pagination

Public routes use Redis-backed per-workspace hourly buckets. `API_LIMIT`
configures each bucket; 429 means wait for the limit window. Calendar/post
queries accept the DTO filters shown in OpenAPI. Publishing-job lists use
cursors and bounded page sizes in the authenticated product API.

## Stable v1 endpoints

| Method   | Path                                 | Scope                | Purpose                                        |
| -------- | ------------------------------------ | -------------------- | ---------------------------------------------- |
| `POST`   | `/upload`                            | `media:write`        | upload bytes and return media record           |
| `POST`   | `/upload-from-url`                   | `media:write`        | bounded, redirect-aware, SSRF-guarded import   |
| `GET`    | `/posts`                             | `posts:read`         | tenant post list                               |
| `GET`    | `/posts/:id/status`                  | `posts:read`         | durable `PublishingJob` status/attempt/error   |
| `GET`    | `/posts/:id/receipts`                | `posts:read`         | ordered delivery evidence and webhook state    |
| `POST`   | `/posts`                             | `posts:write`        | create draft, publish now, or schedule         |
| `DELETE` | `/posts/:id`                         | `posts:write`        | delete/cancel one destination                  |
| `DELETE` | `/posts/group/:group`                | `posts:write`        | delete/cancel a multi-destination group        |
| `GET`    | `/find-slot/:id`                     | `posts:read`         | next available channel slot                    |
| `GET`    | `/groups`                            | `posts:read`         | saved channel groups                           |
| `GET`    | `/is-connected`                      | `integrations:read`  | API connectivity check                         |
| `GET`    | `/integrations`                      | `integrations:read`  | connected channels and safe health projections |
| `GET`    | `/fleet-health`                      | `integrations:read`  | fleet summary, filters, queues, and success rate |
| `GET`    | `/social/:identifier`                | `integrations:read`  | provider metadata/capabilities                 |
| `GET`    | `/integration-settings/:id`          | `integrations:read`  | settings schema for a connection               |
| `DELETE` | `/integrations/:id`                  | `integrations:write` | disconnect tenant-owned channel                |
| `GET`    | `/webhooks`                          | `webhooks:read`      | list endpoints without signing secrets         |
| `POST`   | `/webhooks`                          | `webhooks:write`     | register endpoint; returns secret once          |
| `DELETE` | `/webhooks/:id`                      | `webhooks:write`     | remove an endpoint                              |
| `POST`   | `/webhooks/:id/rotate-secret`        | `webhooks:write`     | rotate and return a new secret once             |
| `GET`    | `/analytics/:integration?date=`      | `analytics:read`     | provider account analytics                     |
| `GET`    | `/analytics/post/:postId?date=`      | `analytics:read`     | provider post analytics                        |
| `GET`    | `/notifications`                     | `notifications:read` | notifications                                  |
| `POST`   | `/generate-video`, `/video/function` | `video:write`        | optional configured video pipeline             |

Maintenance routes (`/posts/:id/missing`, release/settings/status mutation, and
`/integration-trigger/:id`) require `*`. Prefer the stable routes above.

## Public service status

`GET /public/status` is an unauthenticated, aggregate-only endpoint used by the
public `/status` page. It is cacheable for 30 seconds and returns:

- current `overall.state`, code, reason, and latest observation time;
- rolling 30-day uptime for API, database, queue coordination, and publishing
  engine components; and
- rolling 24-hour, 7-day, and 30-day confirmed posting success by platform.

Component uptime comes from one-minute durable probes. Missing minute buckets
after a component's first observation count as unavailable; evidence older than
150 seconds is an outage even if the last stored sample was operational. Time
before the first sample is not invented.

Posting success is `confirmed_live / (confirmed_live + final_failed)`. Draft,
scheduled, queued, uploading, sent-but-unconfirmed, retrying, cancelled, and
other nonterminal jobs are excluded. A rate with fewer than 20 terminal
deliveries is labeled `INSUFFICIENT_DATA`; an empty dataset is never returned
as 100%. The endpoint includes no workspace, connection, post, token, failure
body, or platform-account identifier.

## Billing catalog and successful-post usage

The authenticated app endpoint `GET /user/subscription/tiers` returns exactly
four plans: Free (50 confirmed-live destinations/month, five accounts), Starter
($29, 2,000), Growth ($99, 15,000), and Scale ($299, 100,000). Connected
accounts are unlimited on every paid plan. Checkout accepts only `STANDARD`,
`TEAM`, or `PRO`; historical `ULTIMATE` records resolve to Scale and are never
returned as a purchasable tier.

`GET /user/subscription` returns the subscription plus its current usage:

```json
{
  "subscription": { "subscriptionTier": "TEAM", "period": "MONTHLY" },
  "usage": {
    "metric": "confirmed_live_destinations",
    "tier": "TEAM",
    "periodStart": "2026-08-01T00:00:00.000Z",
    "periodEnd": "2026-09-01T00:00:00.000Z",
    "limit": 15000,
    "used": 8241,
    "remaining": 6759,
    "exhausted": false
  }
}
```

One unit is written per destination only in the same database transaction that
records `confirmed_live` after independent platform verification. Draft,
scheduled, queued, uploading, sent, retrying, failed, cancelled, and ambiguous
outcomes consume zero. Replayed confirmation cannot double-meter, and deleting
a Post does not delete its historical usage. Annual subscriptions still receive
monthly posting windows anchored to the subscription anniversary.

## Create/schedule example

Every post-creation request requires `Idempotency-Key` (8-200 URL-safe
characters). Generate one key for the creation intent and reuse that exact key
and body after timeouts, connection loss, or 5xx responses. A completed replay
returns the original post IDs with `Idempotency-Replayed: true`; reusing the key
for different content returns `409 idempotency_key_reused`. A concurrent request
returns `409 idempotency_request_in_progress` and a `Retry-After` header. Keys
are scoped to the API key's workspace and are never a substitute for auth.

```bash
curl -X POST "$API/public/v1/posts" \
  -H "Authorization: $PUBLISHLY_API_KEY" \
  -H "Idempotency-Key: campaign-2026-08-10-location-042" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "schedule",
    "date": "2026-08-15T14:30:00.000Z",
    "shortLink": false,
    "tags": [],
    "posts": [{
      "integration": { "id": "<channel-id>" },
      "value": [{
        "content": "A scheduled post",
        "image": [{ "id": "<media-id>", "path": "<media-url>" }]
      }],
      "settings": { "__type": "<provider-identifier>" }
    }]
  }'
```

`type` is `draft`, `schedule`, or `now`. Each selected provider becomes an
independent destination post and job. Additional `value` entries represent a
thread/first-comment chain where the provider advertises it. The backend
resolves the channel inside the key's workspace and runs the same provider
validation used by the dashboard.

TikTok and Facebook-Login Instagram posts additionally run a live platform
preflight before any post, idempotency result, publishing job, or account-queue
entry is created. Media references must resolve to the submitted `id` and exact
`path` inside the API key's workspace and must have verified upload metadata.
Validation failures are always structured:

```json
{
  "statusCode": 400,
  "provider": "tiktok",
  "name": "Creator account",
  "failureClass": "user_action_needed",
  "code": "tiktok_self_only_unaudited",
  "reason": "TikTok permits only SELF_ONLY for this unaudited Publishly app.",
  "message": "TikTok permits only SELF_ONLY for this unaudited Publishly app."
}
```

`failureClass` is `recoverable`, `user_action_needed`, or `data_problem`.
Clients should branch on `code`, show `reason`, and retry only `recoverable`
preflight failures.

Recoverable provider failures use durable exponential backoff with jitter. A
platform `429` is queued for the affected connection until `Retry-After` or the
provider reset time, and is exposed immediately as a `rate_limited` failure,
failed receipt with `willRetry=true`, and webhook. Publishly never automatically
replays a mutation after an ambiguous timeout or 5xx response.

## Publishing status

`GET /posts/:id/status` returns the operational ledger, including
`deliveryStage`, latest classified failure fields, and ordered `receipts` and
`failures`. `GET /posts/:id/receipts` is the smaller receipt-only projection.

The public receipt lifecycle is `queued -> uploading -> sent -> confirmed_live`
or `failed`. `sent` means the platform accepted the mutation; it is not success.
`confirmed_live` is written only after a separate platform status/resource read
proves the post exists. A post that cannot be confirmed ends with a classified
failure, commonly `user_action_needed/outcome_unknown`, and must not be blindly
retried.

Each configured webhook receives the same stages as a signed CloudEvents-style
envelope:

The canonical receiver contract, complete event catalog, signature-verification
example, retry timing, deduplication rules, and management endpoints are in
[WEBHOOKS.md](./WEBHOOKS.md).

```json
{
  "specversion": "1.0",
  "id": "post.receipt:<stable-id>",
  "type": "post.receipt",
  "time": "2026-08-10T13:00:00.000Z",
  "data": {
    "postId": "...",
    "integrationId": "...",
    "provider": "instagram",
    "stage": "confirmed_live",
    "attempt": 1,
    "providerPostId": "...",
    "providerUrl": "...",
    "confirmationMethod": "instagram_media_read"
  }
}
```

Delivery is at least once. Deduplicate with `X-Publishly-Event-Id`. Verify
`X-Publishly-Signature` by computing HMAC-SHA256 over
`<X-Publishly-Timestamp>.<raw request body>` using the webhook signing secret;
the header format is `t=<timestamp>,v1=<hex digest>`. Failure occurrences also
emit `post.failure` with `failure.class`, `failure.code`, and `failure.reason`.

## Connection and token health

`GET /integrations` exposes the safe fleet-health projection for every
connection. It includes `tokenExpiration`, exact `tokenDaysRemaining`,
`tokenHealthState`, `tokenHealthReason`, `connectionHealthState`,
`connectionHealthReason`, `lastProviderContactAt`, `lastSuccessfulPublishAt`,
`consecutiveErrors`, `staleSince`, `deadAccountAt`, and nested
`platformTruth`. Access tokens, refresh tokens, linked Page IDs, raw provider
responses, and webhook secrets are never returned. The canonical many-to-many
groups and tags are exposed only through the authenticated fleet-health API
below.

`platformTruth` contains `state`, `publishingMode`, `auditState`, `code`,
non-empty `reason`, `checkedAt`, safe account type/Page-link boolean, and the
latest whitelisted TikTok creator options. States are `NOT_APPLICABLE`,
`READY`, `LIMITED`, `INVALID`, and `UNKNOWN`. In particular,
`code=tiktok_self_only_unaudited`, `publishingMode=SELF_ONLY`, and
`auditState=UNAUDITED` means every direct post is private-only; it must never be
presented as public-capable.

Token states are `UNKNOWN`, `HEALTHY`, `EXPIRING`, `EXPIRED`, and
`RECONNECT_REQUIRED`. Publishly uses a conservative expected lifetime when the
provider supplies no expiry or a longer one: 60 days for Meta,
LinkedIn, and TikTok connections, and 90 days for X. A shorter provider expiry
always wins. Warning events fire once as a token crosses 30, 14, 7, 3, and 1
days remaining; refreshing or reconnecting resets the thresholds for the new
token.

Connection states are `HEALTHY`, `AT_RISK`, `DEAD`, `RECONNECT_REQUIRED`, and
`DISABLED`. Authentication, permission, account-disabled, and
account-restricted errors require reconnect immediately. Three consecutive
connection-level failures mark an account dead; rate limits and content/media
validation errors do not count. Fourteen days without successful provider
contact marks a connection stale/at-risk, and 30 days marks it dead. A later
`confirmed_live` receipt explicitly recovers the connection and clears its
error/stale counters.

The signed health webhook types are:

- `token.expiring`
- `token.expired`
- `token.refreshed`
- `connection.at_risk`
- `connection.reconnect_required`
- `connection.stale`
- `connection.dead`
- `connection.recovered`
- `platform.ready`
- `platform.limitation`
- `platform.invalid`
- `platform.truth_unknown`

They use the same HMAC headers, three-attempt delivery, durable attempt ledger,
and at-least-once semantics as post webhooks. Their envelope contains a stable
health-event ID and machine-readable context:

```json
{
  "specversion": "1.0",
  "id": "connection.health:<stable-id>",
  "type": "token.expiring",
  "time": "2026-08-10T12:00:00.000Z",
  "data": {
    "integrationId": "...",
    "provider": "facebook",
    "severity": "warning",
    "code": "token_expiring",
    "reason": "The facebook token expires in 10 day(s). Reconnect or refresh it before expiry.",
    "daysRemaining": 10,
    "consecutiveErrors": null
  }
}
```

The authenticated dashboard API also provides
`GET /integrations/health-events?integrationId=<id>` for the append-only event
ledger. Failed webhook delivery remains explicit on each event instead of being
reported as delivered or discarded.

Authenticated operators can force a tenant-scoped read with
`POST /integrations/:id/platform-truth/refresh`. It returns the redacted
`platformTruth` plus a classified `failure` when the provider read could not be
completed. A versioned six-hour Temporal sweep refreshes idle TikTok and
Facebook-Login Instagram connections as well.

## Authenticated fleet health API

The tenant dashboard at `/fleet` uses `GET /integrations/fleet-health`. This is
an authenticated product route rather than public v1. Query parameters are:

| Parameter    | Values                      | Meaning                 |
| ------------ | --------------------------- | ----------------------- |
| `windowDays` | `7`, `30`, or `90`          | terminal outcome window |
| `groupId`    | tenant account-group ID     | one account-group facet |
| `tagId`      | tenant account-tag ID       | one account-tag facet   |
| `color`      | `green`, `yellow`, or `red` | derived health color    |

Each connection row includes its safe token/connection projection, group and
account tags, platform-truth projection, last provider/live contact, active
queue count/oldest job, retry
count, and confirmed posting success. Success is
`confirmed_live / (confirmed_live + final_failed)`; queued, uploading,
sent-but-unconfirmed, cancelled, drafts, and recoverable failures awaiting
retry are not counted. With no terminal evidence, `successRate` is `null`.

Fleet color is deterministic: limited/invalid platform truth,
expired/reconnect-required tokens, and dead/reconnect-required/disabled
connections are red; unknown platform truth, unknown/expiring tokens, and
at-risk connections are yellow; otherwise the row is green. Platform truth has
reason-display precedence so a private-only state cannot be hidden behind a
healthy token. The underlying states and non-empty reasons remain in the
response.

The dashboard's mutating routes require channel/admin update permission:

- `POST /integrations/fleet-health/reconnect-plan` with `integrationIds`
  validates 1-500 tenant-owned connections and returns ordered safe OAuth
  actions plus machine-coded rejections. The UI performs provider consent one
  account at a time and only advances after the OAuth callback returns.
- `POST /integrations/fleet-health/connect-plan` accepts unique
  `{provider,count}` selections totaling 1-500 actions. It returns standard
  OAuth actions in stable order and machine-coded rejections for unconfigured,
  custom-field, external-instance, and extension-only providers. The `/fleet`
  UI stores safe metadata only, runs one consent flow at a time, and advances
  only when the expected provider callback confirms success.
- `POST /integrations/fleet-health/tags` creates or revives a tenant-owned
  account tag by normalized name. `PUT .../tags/:tagId` updates it and
  `DELETE .../tags/:tagId` archives it without destroying historical
  assignments.
- `PUT /integrations/fleet-health/tags/:tagId/assign` bulk adds or removes a tag
  from 1-500 tenant-owned connections. Mixed-tenant selections make no partial
  writes.
- `POST /integrations/fleet-health/groups` creates or revives a canonical
  many-to-many account group. `PUT .../groups/:groupId` updates it,
  `DELETE .../groups/:groupId` archives it, and
  `PUT .../groups/:groupId/assign` atomically adds or removes 1-500 connections.
  Legacy single-customer group memberships are backfilled during migration.
- `GET /integrations/fleet-health/queues/:integrationId` returns the persisted
  FIFO destination queue, current lease/cooldown, and non-empty terminal code
  and reason for the first 100 items. Tenant ownership is always enforced.

## Staggered fleet scheduling

`POST /posts/fleet-stagger` distributes the same content to every active
connection in a canonical account group. It requires `Idempotency-Key`,
preflights every destination before writing any post, sorts accounts by stable
connection ID, and allocates distinct timestamps inside the requested window.
Existing scheduled posts on each destination are collision-checked. A window
that cannot fit the fleet at `minimumSpacingSeconds` is rejected in full; it
never silently collapses posts onto the same time.

```bash
curl -X POST "$PUBLISHLY_URL/posts/fleet-stagger" \
  -H "Authorization: Bearer $PUBLISHLY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: launch-east-coast-2026-08-10" \
  -d '{
    "accountGroupId": "group_123",
    "windowStart": "2026-08-11T09:00:00-04:00",
    "windowEnd": "2026-08-11T12:00:00-04:00",
    "timezone": "America/New_York",
    "minimumSpacingSeconds": 60,
    "shortLink": false,
    "tags": [],
    "value": [{"content":"Shared launch copy","image":[]}],
    "settingsByProvider": {
      "facebook": {},
      "instagram": {}
    }
  }'
```

Windows must use ISO timestamps with an explicit `Z` or UTC offset plus a
valid IANA timezone, making DST transitions unambiguous. A successful response
contains the distribution ID and each connection's deterministic `postId`,
`postGroup`, and `scheduledAt`. Repeating the same key and payload returns the
same allocation with `Idempotency-Replayed: true`; reusing the key for another
payload returns `409 idempotency_key_reused`. If infrastructure stops partway,
the durable distribution ledger marks the exact failed item and a same-key
retry resumes only `ALLOCATED` items. Deterministic post IDs prevent duplicate
workflow starts even during concurrent retries.

## Calendar intent and reservation outcomes

Scheduled post creation accepts an optional `scheduleIntent` alongside the UTC
`date`:

```json
{
  "date": "2026-11-01T06:30:00.000Z",
  "scheduleIntent": {
    "localScheduledAt": "2026-11-01T01:30:00",
    "timezone": "America/New_York",
    "utcOffsetMinutes": -300,
    "dstFold": 1
  }
}
```

The UTC instant remains authoritative; the local intent preserves what the
operator chose across DST. Callers that omit this object remain compatible and
are recorded honestly as UTC. A conflicting account/instant returns a
classified `calendar_slot_conflict` with a durable `reservationId`; it is never
silently shifted. Ledger/cutover outages return `503` with `failureClass`,
`code`, and `reason`, and no publishing workflow starts.

Authenticated date changes accept the same `scheduleIntent` object and an
`Idempotency-Key` header. Exact retries reuse the same owner intent. Published
or pinned slots require the existing explicit republish path to move.

## Bulk operations

Bulk CSV preview/commit/report and bulk shift/delete are currently authenticated
dashboard endpoints under `/bulk`, not part of public v1. They execute in
Temporal after commit. Do not build a customer integration against those routes
until a versioned public bulk contract is added.

## Errors

| Status | Meaning                                                          |
| ------ | ---------------------------------------------------------------- |
| 400    | DTO/provider/media validation failed                             |
| 401    | missing, invalid, revoked key or inactive subscription           |
| 402    | plan does not include API/limit reached                          |
| 403    | valid key lacks required scope                                   |
| 404    | resource absent from this workspace (including cross-tenant IDs) |
| 429    | rate limit exceeded                                              |
| 5xx    | transient service/configuration failure; inspect request ID      |

Responses include `X-Request-ID`; include it in support reports. Never log or
send the full API key after initial creation.
