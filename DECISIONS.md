# Publishly architectural decisions

This is an append-only decision log for the reliability-layer implementation. A decision is recorded here before the corresponding code is changed. Later corrections supersede an earlier decision explicitly; they do not silently rewrite history.

## ADR-001 — Post failures use a closed three-class taxonomy and an append-only failure ledger

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 1, Failure taxonomy

### Context

Publishly currently has a mutable `PublishingJob.failureCategory` string and a nullable `lastError`. Error meaning is split across provider exception types, message-substring guesses, Temporal catches, `Post.error`, notifications, and a separate `Errors` table. The same condition can therefore be named differently, and an empty or generic “Unknown Error” can reach a terminal job. A mutable row also cannot prove that a recoverable failure and retry occurred before a later success.

The product promise requires every post-related failure occurrence—not only the final state—to be persisted, classified, given a stable code and useful reason, and offered to configured webhooks.

### Decision

1. Every post failure has exactly one of these API/DB classes:

   - `recoverable`: Publishly may retry without user/content changes and without risking a duplicate provider mutation.
   - `user_action_needed`: Publishly must stop automatic mutation retries until a person reconnects, fixes permissions/account state, or reconciles an ambiguous provider outcome.
   - `data_problem`: the caption, settings, media, or requested platform behavior must change before retrying.

2. `outcome_unknown` is `user_action_needed`, not `recoverable`. The provider may already have published, so an automatic retry could double-post. Its prescribed action is to reconcile the provider account first.

3. A stable failure code refines the class. Codes are owned by one central catalog. Provider text is evidence, never the API contract. Initial codes cover queue/network/provider availability, rate limiting, safe transient failure, token refresh/reconnect, permission/account state, ambiguous outcome, invalid caption/settings/media, unsupported content, provider rejection, and an explicit `internal_error` fallback.

4. Every failure has a normalized, non-empty, bounded human reason. Missing strings, non-`Error` throws, cyclic objects, and unrecognized provider responses receive the catalog’s actionable default reason. The phrases `Unknown Error`, `failed with no reason`, and empty terminal reasons are forbidden in new posting state.

5. `PublishingJob` keeps denormalized latest-failure fields (`failureClass`, `failureCode`, `failureReason`) for fast fleet queries. They are nullable only while a job has no failure. `failureCategory` remains temporarily as a legacy compatibility field and stores the stable failure code.

6. Every occurrence is also written to an append-only `PublishingFailure` row containing a deterministic event ID, tenant/post/job/provider, class, code, reason, retry intent, attempt number, and timestamp. The deterministic ID makes Temporal activity retries and duplicate state calls idempotent.

7. All `RETRYING` and `FAILED` job transitions pass through one `PublishingFailureService`. Direct callers no longer invent categories. The service writes the failure before attempting notification.

8. Each persisted failure produces a versioned `post.failure` webhook envelope for every configured webhook matching the connection. The event ID is the failure-row ID. Per-hook attempts continue to use the existing delivery-attempt ledger. The failure row records `NOT_CONFIGURED`, `DELIVERED`, or `FAILED`, so webhook absence/failure is observable rather than swallowed.

9. Webhook delivery is at-least-once with a stable event ID; receivers deduplicate by `X-Publishly-Event-Id`. Failure persistence is not rolled back when a receiver is unavailable.

10. Provider exceptions carry the normalized taxonomy in Temporal `ApplicationFailure.details`. New workflow code consumes it directly; legacy workflows remain compatible because existing exception type/message fields stay present.

11. Checked-in Temporal workflows and existing activity signatures are not mutated for semantic orchestration changes. Shared state-transition services are hardened for old executions, and a new versioned workflow wrapper performs a terminal invariant check for all newly scheduled posts. A future receipt workflow can supersede that wrapper without changing old histories.

### Consequences

- Fleet health, delivery receipts, status metrics, billing, n8n/Make triggers, and MCP tools can share one failure contract.
- A post can finish successfully while retaining evidence of recoverable failures that preceded it.
- Existing clients reading `failureCategory=outcome_unknown` keep working during migration.
- Provider mappings must be expanded and tested whenever a new platform error is learned; unmatched errors remain visible as `recoverable/internal_error` with a real reason rather than disappearing.
- Webhook receiver downtime does not erase the post failure, and webhook delivery health is independently queryable.

### Rejected alternatives

- **Keep free-form provider categories:** rejected because they cannot support stable automation or exhaustive tests.
- **Infer all classes from HTTP status only:** rejected because the same status has different meaning across provider operations, and ambiguous network outcomes require mutation context.
- **Store only the latest failure on `PublishingJob`:** rejected because it loses retry history and cannot support auditable success-only metering or observability.
- **Treat all 5xx/timeouts as recoverable:** rejected because a timeout after a provider mutation may have succeeded and must not be replayed.

## ADR-002 - Delivery receipts are append-only stage evidence; live confirmation requires an independent platform read

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 2, Delivery receipts

### Context

`Post.state` and `PublishingJob.state` are mutable summaries. A transition directly from `PROCESSING` to `PUBLISHED` cannot show whether Publishly handed bytes to the platform, whether the platform merely accepted a request, or whether a later read proved that the post exists. Several providers return asynchronous `pending` results, while direct providers currently treat a successful create response as publication. That is precisely the silent-success ambiguity this product must eliminate.

### Decision

1. Each platform-specific root post owns one ordered, append-only `PublishingReceipt` stream with exactly these public stages: `queued`, `uploading`, `sent`, `confirmed_live`, or `failed`. `PublishingJob.deliveryStage` is only the latest projection; the stream is the audit record.

2. Stage events use deterministic IDs derived from post, attempt, stage, provider post ID, or linked failure event. Activity replay and API retries therefore do not duplicate receipts or webhooks.

3. Lifecycle gaps are repaired explicitly. Recording `uploading` ensures a `queued` receipt exists; recording `sent` ensures `queued` and `uploading`; recording `confirmed_live` ensures all preceding stages. The resulting event stream is complete even for executions started before this feature was deployed.

4. `sent` means a provider mutation returned an acceptance/result to Publishly. It never means the post is live. The provider ID and canonical URL are retained as evidence when available.

5. `confirmed_live` requires a second, read-only observation independent of the create response:

   - asynchronous providers qualify only when their status/read API reports the created object complete;
   - direct providers use `SocialProvider.confirmPost`, which performs an official provider read when implemented or a constrained read of a canonical, post-specific platform URL;
   - a generic HTTP 200 from the original create call can never create `confirmed_live`;
   - unsupported, private, missing, rate-limited, and temporarily unavailable confirmation results remain explicit and eventually become a classified `failed/outcome_unknown` receipt rather than a false success.

6. Confirmation correlation is carried in provider `pendingData` under a Publishly-owned metadata key. Activity wrappers preserve it across status/finalize cycles without changing existing activity signatures.

7. `Post.state=PUBLISHED` and successful billing eligibility are allowed only
   after a `confirmed_live` receipt exists. The legacy `sendWebhooks` Temporal
   activity name remains registered as a no-op for history compatibility, but
   its unversioned, non-envelope `post.published` delivery is retired. Emitting
   both contracts would create duplicate success signals with different
   payload and failure semantics. `post.receipt` at `confirmed_live` is the one
   success webhook for old and new workflow versions; the shared `updatePost`
   activity enforces the prerequisite before historical workflows reach the
   compatibility shim.

8. Every stage event emits a signed, versioned `post.receipt` webhook with the stable receipt ID. Delivery attempts use the existing webhook attempt ledger. Each receipt records `NOT_CONFIGURED`, `DELIVERED`, or `FAILED`, so receiver outages cannot erase or hide lifecycle evidence.

9. A classified `PublishingFailure` also creates a linked `failed` receipt. Failure persistence remains authoritative; if receipt creation or dispatch fails, the activity fails and is retried against deterministic IDs.

10. Receipt history is tenant-scoped and queryable from both authenticated dashboard routes and API-v1 status/receipt routes. Responses expose the latest projection and complete ordered events, including webhook delivery state and confirmation method, but never access tokens or raw provider secrets.

### Consequences

- A fleet operator can distinguish "still uploading", "accepted by platform", and "proved live" without reading logs.
- Providers without a valid read-after-write mechanism are surfaced honestly as unconfirmed instead of being reported as published.
- Pending providers can reuse their existing durable status loops; direct providers gain a single confirmation contract that can be strengthened provider by provider.
- Webhook consumers can reconstruct every post lifecycle and deduplicate safely by event ID.
- Item 3 retries only read-only confirmation after `sent`; it must never replay the provider mutation merely because confirmation is delayed.

### Rejected alternatives

- **Rename mutable job states only:** rejected because retries overwrite history and cannot prove what happened.
- **Treat a create API 2xx as live:** rejected because acceptance and publication are different states on every asynchronous platform.
- **Probe every release URL without checking specificity:** rejected because profile/channel/login pages can return 200 when the individual post does not exist.
- **Let unverified posts remain `sent` forever:** rejected because every lifecycle must end in `confirmed_live` or a classified, observable failure.

## ADR-003 - Creation intent is idempotent; recoverable delivery retries use a durable, rate-aware policy

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 3, Retries and idempotency

### Context

`PublishingJob.idempotencyKey=publish:<postId>` prevents two jobs from owning one already-created post, but it does not identify an HTTP creation intent. A client that loses the response from `POST /posts` or `POST /public/v1/posts` can currently create a second set of post rows and a second provider mutation. Provider adapters also sleep and retry some 429/5xx responses inside an activity, which hides rate-limit state from operators and can replay a mutation whose outcome is ambiguous. The checked-in V106 workflow has fixed retry delays and must remain unchanged for Temporal history compatibility.

### Decision

1. Both post-creation HTTP endpoints require an `Idempotency-Key` header. Keys are validated, tenant-scoped, and stored only as a SHA-256 digest. The request identity also includes the normalized creation method and a canonical SHA-256 hash of the mapped request body.

2. A new `PostCreationRequest` ledger owns each `(organizationId, keyHash)` intent. It stores the request hash, processing lease, attempt count, stable allocated post IDs, terminal response, and a classified last error. The same key and same request returns the original response with `Idempotency-Replayed: true`; the same key with different content returns HTTP 409; a concurrent live lease returns HTTP 409 plus `Retry-After`; a failed or expired lease can be claimed and resumed.

3. Root posts, comments, and groups are allocated deterministic IDs from the tenant and key digest before any database write. A resumed partial multi-destination request therefore upserts the same rows. Initial workflow starts use the stable `post_<postId>` identity with `USE_EXISTING`; retries cannot terminate or duplicate an already-running initial workflow. Explicit reschedule/republish paths retain their existing replacement behavior.

4. The idempotency ledger is completed only after every destination has a durable post/job result. Exceptions are normalized and persisted on the ledger before being returned. Creation-request failures cannot disappear even when no `Post` row exists yet; once a post row exists, its publishing failures continue through the failure/receipt/webhook ledgers from ADR-001 and ADR-002.

5. Newly created posts run a versioned V108 workflow. V106 and V107 remain unchanged for existing Temporal histories. V108 preserves the mutation-safety and receipt invariants of V106 while replacing fixed transient delays with the shared retry policy.

6. Only a classified `recoverable` failure whose provider adapter proves the mutation was not accepted may re-run a publishing mutation. Timeouts, connection loss after bytes may have been sent, unclassified 5xx responses, and all `user_action_needed` or `data_problem` failures stop mutation retries. Read-only status and confirmation calls may retry because they cannot double-post.

7. Recoverable attempts use capped exponential backoff with deterministic full jitter. The policy is pure and replay-safe: base 15 seconds, exponent by retry ordinal, cap 30 minutes, and no more than five publishing mutation attempts. A valid provider `Retry-After` or reset time is a lower bound, capped at 24 hours; it is never shortened by jitter.

8. HTTP 429 is converted immediately into a structured `ProviderTransient` with code `rate_limited` and bounded retry metadata. Adapters do not sleep or recurse on 429. The retry is recorded as `RETRYING/rate_limited`, receives a failure receipt and webhook, and exposes `nextAttemptAt` before the workflow sleeps.

9. Rate-limit gates are connection-scoped. The integration stores `rateLimitedUntil` plus the last observed reason/time. V108 checks the gate before every root mutation, so later posts for the same account queue behind the known reset instead of repeatedly hitting the platform. A later 429 only extends the gate; successful provider acceptance clears an expired gate.

10. Provider 5xx handling distinguishes read operations from mutations. Read-only calls may surface a safe recoverable provider-unavailable failure. Mutation 5xx responses are `outcome_unknown` unless the provider explicitly documents that no mutation was accepted. Generic adapter code never retries them in process.

11. SDK and first-party dashboard callers generate and send a key per user creation intent. Documentation makes key reuse across network retries mandatory. Internal batch/automation callers retain or add their own deterministic row/run IDs; all public creation surfaces exposed in item 10 must route through this same contract.

### Consequences

- Losing an HTTP response, retrying after a gateway timeout, or racing two identical requests cannot create a second platform post.
- Operators can see every backoff and rate-limit delay in job state, receipts, and webhooks instead of waiting on a hidden adapter timer.
- A provider reset can pause only the affected connection while other fleet accounts continue.
- V108 adds workflow code, but avoids nondeterminism and preserves all existing histories.
- Clients must retain their idempotency key until they receive the terminal creation response.

### Rejected alternatives

- **Use the request body hash as the idempotency key:** rejected because two intentional identical posts are valid separate intents.
- **Rely on `PublishingJob.idempotencyKey`:** rejected because random post IDs have already diverged by the time that key exists.
- **Cache only the HTTP response:** rejected because a crash between database rows and cache completion still duplicates a partial batch.
- **Retry every 429/5xx inside provider adapters:** rejected because hidden sleeps are not durable or observable, and mutation 5xx outcomes are ambiguous.
- **Change V106 in place:** rejected because Temporal workflow history must remain deterministic for executions already in flight.

## ADR-004 - Connection health is a persisted state machine driven by token horizon and provider observations

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 4, Token health engine

### Context

`Integration.tokenExpiration`, `refreshNeeded`, and `disabled` describe only a few current flags. They cannot answer when a token was issued, whether an expiry is expected, when the provider last acknowledged the account, how many connection-level errors occurred in a row, or why an account is considered dead. The current refresh path also catches provider errors and returns `false`, losing the original reason. Fleet warnings and webhooks need a durable transition source rather than calculations that exist only while rendering a page.

### Decision

1. Token state and connection state are independent projections on `Integration`:

   - token state is `UNKNOWN`, `HEALTHY`, `EXPIRING`, `EXPIRED`, or `RECONNECT_REQUIRED`;
   - connection state is `HEALTHY`, `AT_RISK`, `DEAD`, `RECONNECT_REQUIRED`, or `DISABLED`.

   Each projection stores its current human reason and evaluation/change timestamps. Dashboard color in item 5 is derived from these states; it is not an additional source of truth.

2. Every token write records `tokenIssuedAt`, `tokenExpiration`, and the expected lifetime in days. Provider policy supplies a conservative expected horizon when the OAuth response is absent or longer: Facebook/Instagram/Threads, LinkedIn, and TikTok use 60 days; X uses 90 days. A shorter provider-reported `expiresIn` always wins. Other providers retain their explicit expiry or `UNKNOWN` when none is available.

3. Token warnings use exact computed `tokenDaysRemaining` plus deduplicated thresholds at 30, 14, 7, 3, and 1 days. Crossing a threshold creates one `TOKEN_EXPIRING` event keyed by connection, token expiry, and threshold. Expiry, refresh/reconnect requirement, and successful refresh have their own deterministic events. A refreshed/reconnected token resets warning deduplication.

4. A new append-only `ConnectionHealthEvent` ledger stores connection/provider, event type, severity, machine code, non-empty reason, optional days remaining and consecutive-error count, occurrence time, and webhook delivery state. Projection updates and event creation occur transactionally.

5. Every health event emits a signed event-specific webhook (`token.expiring`, `token.expired`, `token.refreshed`, `connection.at_risk`, `connection.reconnect_required`, `connection.stale`, `connection.dead`, or `connection.recovered`). Delivery is at-least-once with the health event ID as `X-Publishly-Event-Id`; receiver failure is persisted and never erases the state transition.

6. Provider observations feed connection health from the existing reliability ledgers:

   - `sent` updates last provider contact;
   - `confirmed_live` updates last provider contact/success, clears consecutive connection errors, stale/dead markers, and emits recovery when applicable;
   - data problems and rate limits do not count toward a dead account;
   - provider/network/status/auth/account errors update last failure and increment consecutive connection errors;
   - reconnect, permission, disabled, restricted, or invalidated-token failures immediately become `RECONNECT_REQUIRED`;
   - three consecutive connection-level failures become `DEAD`.

7. Staleness is evaluated only for non-deleted, non-disabled social connections. Fourteen days without any provider contact makes the connection `AT_RISK` and emits `connection.stale`; 30 days makes it `DEAD`. Creation time is the fallback observation for a connection that has never contacted its provider. Any later confirmed delivery emits `connection.recovered` and clears staleness.

8. Refresh failures retain the normalized provider reason. They mark token/connection `RECONNECT_REQUIRED`, create a health event/webhook, and then preserve the existing reconnect notification. Refresh success records a fresh issue/expiry horizon and emits `token.refreshed`; the error is never reduced silently to a boolean before being persisted.

9. A new versioned Temporal health sweep evaluates all active connections at startup and every six hours. Its activity retries durably with exponential backoff. Existing refresh and publishing workflow histories are not edited; shared token-write and reliability services feed the new engine for both old and new executions.

10. Authenticated integration responses expose health state, reasons, exact safe token dates/days, last provider contact/success/failure, consecutive errors, and dead/stale timestamps. Tokens, refresh tokens, raw provider bodies, and signing secrets are never exposed.

### Consequences

- A fleet operator is warned while the token is still usable, and can distinguish expiry risk from a provider outage or a dead connection.
- Password-change/revocation behavior that cannot be predicted from a date is captured immediately by authentication failures and reconnect state.
- Repeated retry events may turn a connection red before the current post eventually succeeds; confirmation then produces an explicit recovery event rather than silently clearing the badge.
- Staleness thresholds are product policy and can be tuned centrally without changing provider adapters.
- Item 5 can query one projection instead of re-deriving fleet health from raw posts on every dashboard request.

### Rejected alternatives

- **Derive warnings only in React from `tokenExpiration`:** rejected because there is no durable transition, webhook, deduplication, or audit trail.
- **Treat token expiry as the entire connection score:** rejected because revocation/password changes and provider/account restrictions occur before expiry.
- **Count content validation failures as dead-account evidence:** rejected because bad media/copy says nothing about connection health.
- **Declare any single provider outage dead:** rejected because transient platform incidents must remain yellow/retryable; three consecutive connection-level failures or an immediate user-action condition is required.
- **Probe every provider with a synthetic publish:** rejected because it can create side effects and consumes fleet rate limits; health uses real provider observations and supported read paths.

## ADR-005 - Fleet health is a tenant projection over confirmed terminal outcomes

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 5, Fleet health dashboard

### Context

The launch sidebar is designed for composing posts, not for scanning 20-500+
connections. Loading every post/receipt into React or application memory would
make a fleet dashboard increasingly expensive and would invite a second,
inconsistent definition of success. OAuth reconnects also require interactive
provider consent, so a "bulk reconnect" action cannot honestly claim that many
accounts were repaired by one background request.

### Decision

1. `GET /integrations/fleet-health` is a tenant-scoped operational projection.
   It returns one row per active social connection, summary counts, group/tag
   facets, and a generated timestamp. It accepts bounded 7, 30, or 90 day
   windows and optional group, account-tag, and color filters.

2. Posting success rate has one definition everywhere: destinations whose
   current terminal delivery stage is `confirmed_live` divided by destinations
   whose current terminal state is either independently `confirmed_live` or a
   final `failed`. Queued, uploading, sent-but-unconfirmed, cancelled, draft,
   and recoverable failures awaiting retry are excluded from the denominator.
   A connection with no terminal outcomes returns `successRate: null`, never a
   made-up 100%. Retry count is the sum of `max(attempts - 1, 0)` for jobs in the
   selected window.

3. `PublishingJob` stores its tenant-owned `integrationId` as a required,
   indexed dimension. Existing rows are backfilled from their required `Post`
   relation, and all three legacy job-creation paths persist it. Prisma
   `groupBy` over terminal completion time then computes terminal and queue aggregates without raw SQL or
   loading an unbounded post history into Node.

4. Fleet color is a pure projection with red taking precedence over yellow:

   - red: token `EXPIRED`/`RECONNECT_REQUIRED`, or connection
     `DEAD`/`RECONNECT_REQUIRED`/`DISABLED`;
   - yellow: token `UNKNOWN`/`EXPIRING`, or connection `AT_RISK`;
   - green: token and connection are otherwise healthy.

   Every row includes the underlying token/connection states and reasons; color
   never replaces the machine-readable source of truth.

5. Existing `Customer` membership remains the initial group facet. A distinct
   tenant-owned many-to-many `AccountTag` model supplies the tag facet because
   post-content tags have different semantics and lifecycle. The dashboard can
   create tags and bulk add/remove them so tag filtering is usable immediately;
   item 6 builds the broader fleet-primitive workflow on the same model.

6. `POST /integrations/fleet-health/reconnect-plan` accepts 1-500 unique IDs,
   resolves only rows owned by the authenticated organization, and returns an
   ordered safe action/rejection list with machine code and non-empty reason.
   Disabled, unknown, and providers requiring external instance details are not
   silently attempted. The browser stores only safe action metadata and guides
   the operator through provider OAuth one account at a time, returning to
   `/fleet` between accounts. An account is shown repaired only after the normal
   OAuth callback writes the new token and health projection.

7. The tenant page refreshes every 30 seconds, supports group/tag/color/search
   filters, shows exact token horizon, last provider contact/live confirmation,
   terminal counts and per-account success rate, and allows selecting attention
   rows for the guided reconnect flow. API responses never expose access tokens,
   refresh tokens, raw provider payloads, or webhook secrets.

8. Tests cover color precedence, empty/partial/success-only rate math, rolling
   aggregation, group/tag tenant filters, queue age/counts, reconnect input
   limits and cross-tenant IDs, tag assignment authorization boundaries, and UI
   flow helpers. Persistence and aggregation failures surface to the request;
   the dashboard must display a load/action error rather than stale success.

### Consequences

- Fleet operators can compare connections with a consistent success metric and
  immediately distinguish healthy, attention, and broken accounts.
- The API cost scales with connections and grouped result rows rather than raw
  post history.
- Bulk reconnect is honest about OAuth's interactive boundary while still
  removing the work of finding and reopening each broken account manually.
- Account tags become a durable primitive slightly ahead of item 6 because item
  5 cannot be truthfully called tag-filterable without a way to assign them.

### Rejected alternatives

- **Use `Post.state === PUBLISHED` as success:** rejected because platform API
  acceptance is not proof that the post exists live.
- **Treat in-flight posts as failures:** rejected because this would punish long
  uploads and rate-limit queueing before their outcome is known.
- **Compute the dashboard from all receipts in React:** rejected because it is
  unbounded, slow for large fleets, and duplicates backend truth.
- **Open many OAuth windows simultaneously:** rejected because popup blockers,
  provider consent, and account-selection ambiguity make completion unreliable.
- **Reuse content tags for accounts:** rejected because content taxonomy and
  fleet ownership labels are separate domains.

## ADR-006 - Fleet primitives use tenant-owned membership, FIFO mutation leases, and resumable distributions

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 6, Fleet primitives

### Context

The legacy `Customer` field permits one label per connection, provider task
queues serialize only at provider-worker scale, and normal post creation gives
all destinations one date. None can represent overlapping portfolio groups,
prevent two workflows from mutating the same account concurrently, or safely
spread one campaign across hundreds of accounts. OAuth remains interactive, so
connecting several new accounts needs the same honest sequential boundary as
fleet reconnect.

### Decision

1. `AccountGroup` and `IntegrationAccountGroup` are the canonical many-to-many
   grouping primitive. They are organization-owned, case-insensitively unique,
   color-labelled, archivable, and use atomic bulk membership changes capped at
   500 connections. The migration backfills every active legacy `Customer` as
   a group with the same ID and copies `Integration.customerId` membership, so
   existing fleet filters and URLs remain valid while one connection can join
   additional groups. Legacy customer fields remain for compatibility but are
   no longer the fleet source of truth.

2. `AccountTag` gains archive/update semantics. Group and tag create, update,
   archive, list, and bulk add/remove routes validate tenant ownership before
   mutation; a mixed-tenant selection performs zero writes. Archived facets are
   excluded from filters but their historical assignments remain recoverable.

3. Bulk connect is a server-validated plan of 1-500 provider actions. It rejects
   unknown, unconfigured, external-instance, custom-field, extension-only, or
   otherwise nonstandard providers with a machine code and non-empty reason.
   The browser guides one normal OAuth flow at a time and advances only after
   the callback returns to `/fleet`; safe provider/action metadata is resumable,
   but OAuth state and credentials remain server-side.

4. Per-account publishing serialization is persisted in
   `AccountPublishingQueueItem` plus one `AccountPublishingQueueState` row per
   connection. FIFO order is `(scheduledAt, createdAt, postId)`. A versioned
   activity atomically enqueues a tenant-owned post and acquires the connection
   lease only when it is the head. Other workflows receive a position and a
   bounded retry delay; waiting is not misreported as a post failure.

5. The lease surrounds only irreversible primary post mutation. A proved
   provider rejection releases the head for its classified retry/failure; an
   accepted mutation completes it. An ambiguous timeout/outcome completes the
   item but retains a 30-minute account cooldown so a still-running provider
   request cannot overlap the next account mutation. Expired orphan heads are
   reconciled from terminal/sent job evidence during later acquisition and a
   periodic sweep. Queue state/reason is queryable in fleet APIs.

6. Existing Temporal histories and activity signatures remain untouched.
   `postWorkflowV109` is copied from V108 and exclusively owns new histories.
   It acquires the account slot before `postSocialPending`, records retry versus
   terminal versus ambiguous release explicitly in every catch path, and keeps
   V108 as a compatibility export for histories already in flight.

7. `POST /posts/fleet-stagger` is a new idempotent post-creation endpoint. It
   requires `Idempotency-Key`, one active account group, ISO window boundaries,
   an IANA timezone, minimum spacing, shared content/media/tags, and settings by
   provider. All group members and provider settings are preflighted before any
   write. Date parsing is timezone-explicit and normalized to UTC.

8. Stagger allocation is deterministic: members sort by stable connection ID;
   a greedy allocator starts from evenly distributed ideal points, enforces a
   default 60-second minimum between every batch destination, and moves forward
   around existing per-account schedule collisions. If all members cannot fit
   within the inclusive window, the whole preflight fails with
   `stagger_window_too_small`; simultaneous batch timestamps are impossible.

9. `FleetDistribution` and `FleetDistributionItem` persist the request hash,
   allocated post/group IDs, exact UTC slot, and creation state. A repeated key
   with a different payload is rejected. A same-payload retry resumes only
   incomplete items through the existing deterministic post create path, so a
   process/database/workflow-start interruption cannot double-create or
   double-publish earlier members. Any interruption stores a classified,
   non-empty batch failure before surfacing 5xx; validation failures happen
   before the batch crosses its creation boundary.

10. Tests cover many-to-many tenant isolation and archive behavior, bulk OAuth
    plan rejection, FIFO/lease races, retry release, ambiguous cooldown,
    orphan reconciliation, deterministic spacing/timezone/collision behavior,
    too-small windows, same-key replay/conflict, and interrupted distribution
    resume. A queue or batch persistence failure must propagate for durable/API
    retry and may never be translated to a successful response.

### Consequences

- A connection can participate in overlapping brand, region, client, or
  priority groupings without overloading billing/customer semantics.
- Provider capacity remains shared while account-level mutation overlap is
  independently prevented.
- Large campaigns have stable, inspectable schedules and can resume safely
  after partial infrastructure failure.
- V109 adds workflow code, but avoids nondeterminism for existing histories.

### Rejected alternatives

- **Keep one `customerId` as the group model:** rejected because portfolios need
  overlapping groups and customer billing semantics are not fleet taxonomy.
- **Use an in-memory mutex per account:** rejected because workers restart and
  scale horizontally.
- **Hold an account lease while polling confirmation for 30 minutes:** rejected
  because serialization is needed around mutation, not read-only observation.
- **Release immediately after an ambiguous timeout:** rejected because the
  provider request may still be running and overlap the next mutation.
- **Randomly jitter every account date:** rejected because it is hard to audit,
  replay, or prove collision-free.
- **Create each stagger destination without a batch ledger:** rejected because
  an HTTP/process interruption would leave an unknowable partial campaign and
  unsafe client retries.

## ADR-007 - Platform truth is a persisted, refreshed preflight contract

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 7, Platform truth

### Context

TikTok accepts Content Posting API connections before the application has
passed its separate posting audit. An unaudited client can expose only
`SELF_ONLY`; attempting a public visibility later is either rejected or creates
private-only behavior that looks like a successful public post to an operator.
TikTok also requires the latest creator-info response to drive the available
privacy and interaction choices. Publishly currently asks for none of that
truth until the irreversible publish request.

Instagram through Facebook Login similarly depends on a Professional Instagram
account linked to a Facebook Page. The existing page picker filters likely
candidates, but the final selection is not persisted as verified platform
truth, and compose validation does not prove the account/link or inspect the
media metadata that Graph will enforce. A platform 200 at OAuth time is not
evidence that a future post is publishable.

### Decision

1. Each social connection gains a safe platform-truth projection: state
   (`NOT_APPLICABLE`, `READY`, `LIMITED`, `INVALID`, or `UNKNOWN`), publishing
   mode (`NOT_APPLICABLE`, `PUBLIC_CAPABLE`, `ACCOUNT_RESTRICTED`, `SELF_ONLY`,
   or `UNKNOWN`), audit state, machine code, non-empty reason, checked/changed
   timestamps, account type, linked-resource identifier, and whitelisted JSON
   metadata. Raw provider responses and tokens are never stored in or returned
   by this projection.

2. TikTok's `/v2/post/publish/creator_info/query/` response is authoritative.
   An exact `privacy_level_options: ["SELF_ONLY"]` result is persisted as
   `LIMITED` + `SELF_ONLY` + `UNAUDITED`, code
   `tiktok_self_only_unaudited`, with an explicit private-only reason. Public,
   follower, or mutual options are not invented. Missing/malformed creator
   information is `UNKNOWN`, never optimistically public-capable.

3. TikTok creator info is refreshed after connect/token refresh, during every
   compose preflight, and by a versioned periodic sweep for existing or idle
   connections. Direct-post compose accepts only an explicitly selected option
   returned by TikTok, enforces creator interaction-disable flags and the
   account-specific video-duration ceiling, and rejects public intent while the
   connection is `SELF_ONLY`. An intentional `SELF_ONLY` post may proceed, but
   the API and UI retain the limitation visibly.

4. The Facebook-Login Instagram provider re-reads the Page and Instagram nodes
   and proves that the Page's `instagram_business_account.id` matches the
   selected Instagram account. It persists the Page ID and Instagram
   `account_type`. Personal/unknown accounts and absent or mismatched Page links
   are `INVALID`. Business and Creator accounts are Professional accounts for
   feed/Reels; Stories additionally require `BUSINESS`, matching Meta's current
   published contract. The standalone Instagram-Login provider is not falsely
   subjected to the Facebook-Page requirement.

5. Compose validation resolves tenant-owned media-library metadata before
   provider validation. Instagram preflight checks attachment count and shape,
   JPEG-convertible image size/aspect constraints, MP4 video size/dimensions and
   duration, and Story/Trial-Reel shape before any Post, PublishingJob, queue, or
   idempotency result is created. If required metadata is absent or belongs to
   another tenant, validation fails closed with a `data_problem` code and asks
   the caller to upload/re-upload through Publishly; unverifiable media is not
   waved through to fail later.

6. Compose results and create-route errors include a machine-readable
   `failureClass`, `code`, and non-empty `reason` while preserving the existing
   readable `message`/`errors` fields for clients. Platform-truth lookup outages
   are `recoverable`; invalid credentials, missing permissions, account type,
   or Page linkage are `user_action_needed`; incompatible visibility or media
   is a `data_problem` unless the operator must change provider/account setup.

7. Truth transitions are durable connection-health events and webhooks:
   `platform.ready`, `platform.limitation`, `platform.invalid`, and
   `platform.truth_unknown`. Event IDs deduplicate unchanged truth within the
   same token generation. Delivery failure remains queryable and retryable by
   the existing webhook ledger; a truth refresh may never report success after
   a projection write failure.

8. Authenticated and public integration-list responses, compose-validation
   responses, and fleet-health rows use one redacted projection helper. Fleet
   health treats `LIMITED`/`INVALID` as red and `UNKNOWN` as yellow, with
   platform truth taking precedence in the displayed reason. The dashboard
   shows a dedicated visibility/audit badge and reason; the TikTok composer
   shows the private-only warning and only the latest allowed privacy choices.

9. Tests cover exact/mixed/malformed TikTok creator options, every TikTok
   visibility and interaction mismatch, creator-info outages, token failures,
   Instagram personal/unknown/Creator/Business account behavior, missing and
   mismatched Page links, every media boundary and missing-metadata path,
   tenant isolation, event/webhook deduplication and failure, API redaction,
   fleet color precedence, and dashboard/composer rendering helpers.

### Consequences

- Operators can distinguish an authenticated connection from one that can
  actually publish with the intended visibility before scheduling a campaign.
- Existing connections begin as explicitly unknown and are progressively
  verified by the sweep or the next compose action; none are backfilled as
  audited from configuration guesses.
- Compose validation performs provider reads and media lookups, adding bounded
  latency in exchange for moving predictable failures ahead of durable post
  creation.
- Creator accounts remain valid for feed/Reels under the current Meta contract,
  while the stricter Business-only Story rule is enforced at compose time.

### Rejected alternatives

- **Infer TikTok audit state from environment variables:** rejected because
  credentials do not prove the app's current Content Posting audit result.
- **Treat any TikTok connection as public-capable until a publish fails:**
  rejected because that is the silent-failure behavior this item removes.
- **Call creator-info only in the publishing worker:** rejected because the
  user would learn about a deterministic limitation after scheduling.
- **Call every provider from every fleet-dashboard refresh:** rejected because
  30-second polling across 500 accounts would create avoidable rate-limit and
  latency pressure; the dashboard reads a durable projection refreshed at
  connect, compose, and by the periodic sweep.
- **Trust the Instagram page-picker payload:** rejected because it is
  user-controlled and can become stale; Page linkage and account type must be
  re-read from Graph.
- **Let incomplete media metadata pass and rely on Graph errors:** rejected
  because it moves a known data problem back to publish time and recreates a
  silent failure window.

## ADR-008 - Public status is computed from durable probes and confirmed outcomes

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 8, Public status page

### Context

A static green badge or process-uptime counter is not an uptime record. It is
reset by deploys, cannot expose missed intervals, and says nothing about the
publishing engine. Likewise, HTTP acceptance is not a posting-success signal:
Publishly already has stronger evidence in its per-destination delivery ledger,
where only `confirmed_live` proves success and terminal `failed` proves final
failure. The status page is a public reliability claim and therefore must use
those real records without exposing workspace or post identity.

### Decision

1. Add a generic `ServiceHealthSample` ledger with component, UTC minute bucket,
   operational state (`OPERATIONAL`, `DEGRADED`, or `OUTAGE`), latency,
   machine-readable code, non-empty reason, and observation time. A unique
   `(component, bucket)` key makes retries idempotent. Samples are retained for
   45 days and public uptime uses a rolling 30-day window.

2. The singleton backend selected by `RUN_CRON=true` writes one-minute samples
   for `api`, `database`, and `redis`. A successful sample write proves the API
   process and database path are alive; Redis is probed independently. A
   versioned one-minute Temporal workflow writes the `publishing_engine`
   heartbeat, so a stopped orchestrator, unavailable Temporal path, or failed
   database write leaves a visible gap rather than a fabricated green sample.

3. Missing buckets after a component's first observation count as unavailable.
   Time before the first-ever sample is excluded so a new installation does not
   invent historical downtime. `OPERATIONAL` and `DEGRADED` are reachable for
   uptime math, while the current overall state uses the worst component state.
   A latest sample older than 150 seconds is reported as `OUTAGE` with code
   `status_probe_stale`, even if its last stored state was green.

4. Platform posting success is computed directly from `PublishingJob` terminal
   evidence for rolling 24-hour, 7-day, and 30-day windows. The numerator is
   `PUBLISHED + confirmed_live`; the denominator adds only final
   `FAILED + failed`. Drafts, scheduled/queued/uploading/sent jobs, retries in
   progress, cancellations, and ambiguous nonterminal outcomes are excluded.
   Every platform row returns confirmed, failed, sample size, success rate or
   `null`, and latest terminal evidence time. Empty datasets are shown as
   insufficient evidence, never as 100%.

5. `GET /public/status` is unauthenticated, aggregate-only, and returns no
   organization, connection, post, token, failure text, or provider IDs. It is
   cacheable for 30 seconds with stale-if-error protection. Probe failures are
   structured logs with component, code, and non-empty reason; a failed ledger
   write is not reported as a successful probe.

6. `/status` is a server-rendered marketing route with a client-side live panel
   that refreshes every 30 seconds. It displays overall state, last observation,
   rolling uptime per service component, and real posting-success rates per
   platform/window. Fetch failure has an explicit unavailable state. The public
   footer links to the page so the proof is discoverable.

7. Tests cover idempotent sample writes, missing-bucket downtime, pre-history
   exclusion, degraded reachability, stale current state, success-rate
   inclusion/exclusion, no-data behavior, aggregate-only API shape, failed
   probes/writes, workflow heartbeat failure, and UI formatting/fetch-failure
   helpers.

### Consequences

- A deployment needs one backend cron owner and the publishing-engine Temporal
  workflow for a complete component record; their absence becomes visible as
  missing uptime buckets.
- The first 30 days after enabling the ledger show a shorter observed window,
  explicitly returned as `observedSince`, rather than synthetic history.
- Status queries use bounded database aggregates rather than loading every
  minute sample or every post into application memory.
- Posting success can differ from infrastructure uptime because it measures the
  customer-visible outcome, which is the intended distinction.

### Rejected alternatives

- **Process `uptime()` or deploy start time:** rejected because restarts erase
  history and a running process does not prove dependencies or publishing.
- **Always-green static status copy:** rejected because it is not backed by
  evidence and would undermine the reliability position.
- **Count platform HTTP 200 responses as successful posts:** rejected because
  only `confirmed_live` proves the post exists on-platform.
- **Treat no posting evidence as 100% success:** rejected because absence of
  data is not proof of reliability.
- **Load raw jobs or minute samples into the public controller:** rejected for
  scalability and accidental tenant-data exposure; repositories return only
  bounded aggregates.

## ADR-009 - Billing counts durable confirmed-live deliveries, never attempts

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 9, Billing alignment

### Context

The existing monthly-post guard counts Post rows created since a subscription
anniversary. That taxes drafts, scheduled work, retries, and provider failures;
deleting a post can also change the apparent historical usage. The Subscription
row carries a mutable `totalChannels` number, deploy-time pricing overrides can
replace account limits, and an old lifetime-deal path adds five channels at a
time. Those mechanics preserve the per-profile model Publishly is explicitly
leaving behind.

Publishly now has stronger success evidence than Post state: a destination is
successful only when an independent provider read records a `confirmed_live`
delivery receipt. That transition is already written inside one database
transaction, which is the only safe point at which to meter it. The requested
tier list also conflicts in one literal phrase: it says accounts are unlimited
on every tier and separately gives Free five accounts. The explicit Free limit
is treated as the exception; every paid tier is unlimited.

### Decision

1. Add an append-only `SuccessfulPostUsage` ledger. One row represents one
   destination Post that reached `confirmed_live`, with organization, opaque
   Post ID, receipt ID, provider, and confirmation time. `postId` and
   `receiptId` are unique, and there is deliberately no foreign key to Post, so
   deleting content cannot erase billed history. Organization deletion still
   cascades the tenant's ledger.

2. The confirmed-live receipt transaction upserts the usage row before it can
   commit. Replayed confirmation is idempotent; queued, uploading, sent,
   retrying, failed, cancelled, and HTTP-accepted-but-unverified outcomes write
   no usage. If the usage write fails, confirmation also rolls back and the
   activity fails visibly for Temporal to retry; Publishly may not acknowledge
   a successful delivery while silently losing its meter event.

3. Monthly quota checks query only this ledger within the current monthly
   anniversary window. Paid annual plans still receive a monthly posting
   allowance. Free uses the organization's creation timestamp as its anchor;
   paid plans use the subscription creation timestamp. Boundaries are computed
   in UTC and the API returns the start, end, limit, used, and remaining values.
   Creation is allowed while confirmed usage is below the allowance. Because
   the advertised limits are approximate and only success may be metered,
   concurrently in-flight deliveries can finish just above an allowance; the
   next creation is blocked, but no attempt or failed post is retroactively
   charged and no already-live platform post is hidden or undone.

4. The only public/purchasable tiers are Free (50 successful posts/month, five
   accounts), Starter (`STANDARD`, $29/month, 2,000), Growth (`TEAM`,
   $99/month, 15,000), and Scale (`PRO`, $299/month, 100,000). Annual prices
   remain ten monthly payments. `ULTIMATE` remains only as a database/Stripe
   compatibility alias resolved to Scale entitlements; it is not returned by
   the catalog, accepted by new checkout requests, or marketed as a fifth tier.

5. Every paid plan stores an integer sentinel equal to PostgreSQL's maximum
   signed `Int`, but API and UI semantics are `unlimited`; the value is a schema
   compatibility detail, not a billable quantity. Subscription writes derive
   it from the server catalog and no longer accept a caller-supplied channel
   count. Paid-plan pricing/account/post identity fields cannot be changed by
   `PRICING_OVERRIDES_JSON`, and the lifetime path no longer increments channels.
   Downgrading to Free may disable connections above five; paid-to-paid changes
   never disable a connection.

6. Full receipts, classified failures, token/fleet health, webhooks, and
   dead-account visibility remain available on every tier, including Free; the
   reliability wedge is not a paid blind spot. Growth and Scale additionally
   expose `priority_retries` and `sla` entitlements. Priority retries use a
   shorter bounded internal backoff lane, while an explicit provider
   `Retry-After`/reset time always remains the lower bound. No SLA percentage is
   invented in code or copy; the entitlement is named without an unsupported
   numeric promise.

7. The authenticated subscription response includes the successful-post usage
   window, and pricing surfaces state that only independently confirmed live
   destinations consume quota. Tests cover non-success exclusion, duplicate
   confirmation, transactional meter failure, retained ledger design, UTC
   billing boundaries, exact tier facts, protected override failures, hidden
   legacy tier behavior, paid account invariants, Free enforcement, and
   priority retry/provider-rate-limit interaction.

### Consequences

- A post sent to six destinations can consume up to six units, but only for the
  destinations independently confirmed live.
- Operators can schedule work before it consumes quota and are never charged
  for data errors, reconnect failures, exhausted retries, or ambiguous sends.
- A small concurrency overrun is possible at the approximate monthly boundary;
  this is preferred to reservations that would temporarily meter or block work
  that never succeeds.
- Historical usage survives Post cleanup and remains auditable from one durable
  source of truth.
- Legacy `ULTIMATE` records continue to function with Scale entitlements while
  new customers see exactly four plans.

### Rejected alternatives

- **Count Post rows when created or scheduled:** rejected because drafts and
  failures are not successful delivery and deletion rewrites the bill.
- **Count provider HTTP 200 responses:** rejected because acceptance is not
  proof that the post exists on-platform.
- **Infer usage by counting current PublishingJob rows:** rejected because Post
  deletion cascades those rows and would erase billable history.
- **Reserve monthly units before publishing:** rejected because reservations
  would block or appear to charge unsuccessful work and the tier limits are
  intentionally approximate.
- **Keep a configurable paid channel number:** rejected because any finite
  commercial account entitlement recreates per-profile pricing by another
  name.
- **Gate observability on paid plans:** rejected because invisible failures on
  Free would contradict the product's core reliability promise.

## ADR-010 - Distribution adapters are thin clients over one reliability contract

Status: accepted  
Date: 2026-08-10  
Applies to implementation item: 10, Distribution surfaces

### Context

Publishly already has durable post creation, delivery receipts, fleet health,
and signed outgoing webhooks, but those guarantees are not yet packaged as a
complete integration contract. The existing MCP server exposes a legacy
scheduling tool that can create posts without an idempotency key and resolves
legacy plaintext organization keys instead of current scoped `pub_` keys.
There is no first-party n8n package or Make custom app, and webhook behavior is
spread across the general API guide. Copying posting logic into every adapter
would let validation, idempotency, and failure behavior drift at exactly the
surfaces fleet operators use for automation.

### Decision

1. `docs/WEBHOOKS.md` is the canonical webhook contract. It documents every
   emitted event, lifecycle meaning, payload fields, HMAC verification over the
   raw body, timestamp tolerance, at-least-once delivery, stable event-ID
   deduplication, three-attempt retry behavior, receiver status expectations,
   and the rule that delivery exhaustion remains visible in the durable ledger.
   The API guide links to it instead of becoming a second competing contract.

2. Add tenant-scoped public-v1 routes for fleet health and webhook lifecycle.
   `GET /fleet-health` uses the existing safe fleet projection and
   `integrations:read`. Webhook list/create/delete/secret rotation use explicit
   `webhooks:read` and `webhooks:write` scopes. A newly created or rotated secret
   is returned exactly once; list responses never expose it. Connection filters
   remain tenant scoped and webhook destinations retain the existing HTTPS and
   SSRF validation.

3. Ship an installable `n8n-nodes-publishly` community package in
   `integrations/`. Its action node exposes publish now, schedule, receipts,
   and fleet health; its trigger node creates and deletes a Publishly webhook
   for the n8n production URL. Every mutating post operation requires a caller
   supplied idempotency key and sends it unchanged. HTTP errors are surfaced to
   n8n with the provider response and are never converted into successful empty
   items.

4. Ship a Make custom-app bundle in `integrations/` with the same four actions
   and an instant webhook. Creation modules require `idempotencyKey`; the app
   registers/deletes webhook subscriptions through public v1 and exposes the
   signing secret only during registration. The source bundle is JSON-first and
   can be imported into Make without depending on the monorepo runtime.

5. Replace the discoverable legacy MCP scheduling mutation with four explicit
   reliability tools: `publish_post`, `schedule_post`, `get_post_receipts`, and
   `get_fleet_health`. Publish and schedule require idempotency keys and use the
   same server-side mapping, provider preflight validation, durable idempotency
   ledger, and post-creation service as public v1. Read tools return the durable
   receipt/job and fleet projections; they do not infer success from an API
   acceptance response.

6. MCP bearer authentication accepts OAuth `pos_` tokens and hashed scoped
   `pub_` keys. The request context carries the authenticated organization and
   granted scopes. Post mutations require `posts:write` (or MCP OAuth write),
   receipts require `posts:read` (or MCP OAuth read), and health requires
   `integrations:read` (or MCP OAuth read). Legacy keys and URL-embedded MCP/SSE
   credentials remain available only behind `ALLOW_LEGACY_API_KEYS=true` for a
   bounded migration path.

7. Adapter and MCP tests are contract tests, not happy-path demos. They cover
   missing/invalid idempotency keys, body parse errors, provider/API errors,
   replay headers, missing auth, insufficient scopes, missing jobs, webhook
   registration/deletion failure, signature metadata, and downstream health or
   receipt failures. Distribution metadata and documentation are checked
   against the public routes so an adapter cannot silently point at a stale
   endpoint.

### Consequences

- n8n, Make, MCP, and direct HTTP all terminate at the same durable Publishly
  services; adapters contain transport mapping but no shadow retry or posting
  engine.
- Automation authors must persist a stable idempotency key with each creation
  intent. This small requirement is what makes workflow-run retries safe.
- Dynamic webhook triggers need `webhooks:write`, while action-only credentials
  can remain narrowly scoped.
- Existing MCP clients using plaintext keys in URL paths must enable the
  migration flag temporarily or move to a scoped bearer key/OAuth endpoint.

### Rejected alternatives

- **Let each adapter retry POST requests itself:** rejected because only the
  server owns provider ambiguity and durable idempotency; client retries can
  otherwise double-post.
- **Treat the current general API paragraphs as complete webhook docs:**
  rejected because implementers need one versioned receiver contract covering
  verification, deduplication, event schemas, and delivery failure behavior.
- **Make n8n and Make call private dashboard routes:** rejected because cookie
  auth is unsuitable for headless automation and bypasses scoped-key policy.
- **Keep the existing MCP mutation discoverable:** rejected because it declares
  itself non-idempotent and can create posts outside the creation-request
  ledger.
- **Implement separate posting logic in MCP:** rejected because validation and
  failure taxonomy would inevitably drift from public v1.

## ADR-011 - Worker readiness requires bounded execution and a durable activity heartbeat

Status: accepted  
Date: 2026-08-11  
Applies to go-live runtime availability

### Context

The first production-like integration run found that PostgreSQL, Redis, and
Temporal were reachable while reliability work could still remain scheduled
without starting. Every Temporal task queue was configured with 1,000,000
concurrent activity execution slots, and each worker retained the SDK default
of 40 concurrent workflow tasks. On a cold start with histories to replay, the
worker produced workflow-task timeouts and accepted activity tasks into its
local queue without executing them. The orchestrator health endpoint still
returned 200 because it only checked that the Temporal namespace answered.
That is a silent availability failure for the publishing engine.

### Decision

1. Replace the effectively unbounded activity setting with finite defaults:
   32 activity executions and 8 workflow-task executions per worker. Activity
   and workflow pollers default to 4. Provider-specific lower concurrency caps
   continue to win and `WORKER_CONCURRENCY_DIVIDER` still splits a provider cap
   across replicas.
2. The defaults are configurable through
   `WORKER_DEFAULT_ACTIVITY_CONCURRENCY`,
   `WORKER_DEFAULT_WORKFLOW_CONCURRENCY`,
   `WORKER_ACTIVITY_POLLS`, and `WORKER_WORKFLOW_POLLS`. Invalid, zero,
   negative, or excessive values are rejected back to safe bounded defaults;
   activity concurrency is capped at 256 and workflow concurrency at 64.
3. The publishing-engine heartbeat workflow is owned by the orchestrator and
   is started idempotently on every orchestrator boot, independent of the
   backend cron-owner flag. Its one-minute workflow/activity/database round
   trip is the durable evidence that execution, not just connectivity, works.
4. `GET /health/status` still checks the Temporal namespace, then also requires
   the latest `publishing_engine` health sample to be operational or degraded
   and newer than `ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS` (default 180). A
   missing, stale, or outage sample returns HTTP 503 with a machine-readable
   code and a non-empty human reason.
5. Unit tests cover concurrency bounds, missing/stale/outage heartbeats,
   Temporal connection failure, and idempotent heartbeat registration. Live
   integration tests remain responsible for proving queued work completes.
6. The production edge proxy depends on the orchestrator's durable health
   check as well as frontend/backend health. A fresh deployment does not begin
   serving public traffic until the publishing engine has executed and
   persisted current heartbeat evidence.

### Consequences

- Cold-start replay can no longer claim an unbounded number of local activity
  slots or accept workflow work faster than this process can execute it.
- Container readiness now fails closed when the publishing engine is stalled,
  even if the Temporal server itself is reachable.
- Operators may tune concurrency deliberately per deployment without source
  changes, but cannot accidentally restore an unbounded configuration.
- A new orchestrator can remain unready for up to the first successful
  heartbeat; this is intentional because no execution evidence exists yet.

### Rejected alternatives

- **Keep 1,000,000 slots and only extend integration-test timeouts:** rejected
  because the second live import remained scheduled beyond a minute and the
  health endpoint falsely reported success.
- **Treat Temporal namespace connectivity as worker health:** rejected because
  it proves the control plane is reachable, not that a Publishly activity can
  execute and persist evidence.
- **Make every health request start a throwaway workflow:** rejected because a
  15-second container probe would create thousands of visibility records per
  day. The existing minute heartbeat supplies the same end-to-end evidence at
  bounded cost.

## ADR-012 - Production configuration is a fail-closed release gate

Status: accepted  
Date: 2026-08-11  
Applies to go-live configuration and process startup

### Context

The production Compose topology and environment template are complete enough
to start the services, but Compose interpolation only proves that YAML can be
expanded. It does not reject `CHANGE_ME`, example domains, missing encryption
keys, a disabled cron owner, incomplete email/billing credentials, or enabled
test-only switches. Runtime configuration checking also happened after the
backend and orchestrator had opened their health ports. A deployment could
therefore look available briefly, or even pass a shallow container check,
while being unable to authenticate users, seal provider tokens, send account
mail, bill the published plans, or run scheduled status probes.

### Decision

1. Add a deterministic production-environment preflight command. It parses the
   operator-owned env file without printing secrets and fails non-zero for
   missing values, placeholder/example values, malformed public/service URLs,
   weak or reused signing/encryption secrets, unsafe production switches,
   incomplete storage/email/Stripe groups, invalid worker bounds, and missing
   credentials for the social providers explicitly required for launch.
2. The production template declares the launch provider set. This turns the
   integrations advertised by the website into a checked deployment contract;
   an operator may deliberately narrow the set for a staged launch, but cannot
   accidentally omit a provider without the preflight naming it.
3. Production deployment documentation runs the preflight before Compose
   configuration, image build, migrations, or service startup.
4. With `CONFIG_STRICT=true`, backend and orchestrator validate before binding
   their ports. Invalid configuration exits non-zero so the supervisor restarts
   or halts the release; it never exposes a transient green health endpoint.
5. Validation tests cover missing files, placeholders, malformed URLs, secret
   reuse/strength, unsafe flags, credential groups, provider launch coverage,
   concurrency bounds, and a complete valid configuration.

### Consequences

- A fresh checkout is intentionally not externally deployable until the
  operator supplies real domains, secrets, storage, mail, billing, and provider
  application credentials.
- Local development remains warn-only and may use intentionally incomplete
  integrations. Production is explicit and fail-closed.
- Release automation has one stable command whose exit code can gate builds and
  deploys without inspecting human-readable logs.

### Rejected alternatives

- **Rely on Compose `config --quiet`:** rejected because placeholder strings
  and unsafe-but-syntactically-valid values satisfy interpolation.
- **Validate only after `listen()`:** rejected because the process can report
  healthy before exiting and may receive requests during that window.
- **Silently hide unconfigured advertised providers:** rejected because the
  website would promise a launch surface that the deployed API cannot connect.

## ADR-013 - Platform approval is a versioned, fail-closed product surface

Status: accepted  
Date: 2026-08-11  
Applies to provider review and production launch

### Context

Provider approval is not satisfied by possessing client secrets. Reviewers
compare the public website, legal disclosures, requested scopes, consent UI,
callback URLs, and a working end-to-end demonstration. Those facts currently
live in provider source, environment examples, and separate prose files, so
they can drift while every application build still passes.

### Decision

1. Maintain one machine-readable provider approval manifest covering each of
   the ten advertised networks: authentication model, exact scopes, callback,
   required environment variables, review tier, public policy requirements,
   and official documentation links.
2. Expose a public, no-login reviewer page generated from the same manifest.
   It describes the real product, permission purpose, reviewer journey,
   callbacks, and platform limitations without exposing test credentials.
3. Add a deterministic readiness verifier and tests. Production verification
   fails when the manifest, provider registration, required legal identity,
   callback origin, or advertised launch set is inconsistent.
4. Treat provider API versions and requested permissions as reviewed release
   inputs. Pin them centrally, request the narrowest scopes used by shipping
   features, and require a demo step for every retained scope.
5. Keep a dated, operator-executable approval runbook with official sources,
   evidence scripts, rejection traps, and exact post-approval canaries.

### Consequences

- Adding a scope or advertised network now requires an intentional manifest,
  documentation, reviewer-evidence, and verification change.
- An application can build for development while production preflight still
  refuses a legally incomplete or review-inconsistent release.
- Approval remains a decision made by each platform; Publishly can maximize
  acceptance readiness but must never claim or guarantee approval.

### Rejected alternatives

- **Keep approval facts only in prose:** rejected because prose cannot gate a
  release or prove that code and reviewer instructions still match.
- **Request broad scopes for future features:** rejected because unused access
  is a common review rejection and violates least-privilege expectations.
- **Publish reviewer credentials on the website:** rejected because they
  belong only in each platform's protected submission form.

## ADR-014 - Provider-specific truth must be enforced before user consent

Status: accepted  
Date: 2026-08-11  
Applies to TikTok, Meta, Google/YouTube, Bluesky, and Mastodon connections

### Context

Several networks impose behavior that a generic OAuth-and-publish abstraction
cannot represent safely. TikTok requires current creator information and an
explicit music-usage declaration at posting time. YouTube requires an in-app
disconnect to revoke Google access and remove authorized data. Bluesky uses a
revocable app password rather than disabling account security. Mastodon apps
are registered per server, not through one global production secret.

### Decision

1. TikTok compose fetches current creator information when the posting UI is
   opened, displays the creator, presents only returned privacy choices with no
   default, defaults interactions and disclosure controls off, enforces
   creator capability flags, requires the mandated declaration, and blocks an
   incomplete commercial-content selection. Server-hosted media uses
   `PULL_FROM_URL`; production requires a TikTok-verified media URL prefix.
2. Instagram preflight continues to block unsupported account/media state at
   compose time, and Meta Graph calls use one centrally configured current
   version rather than mixed hard-coded versions.
3. YouTube disconnect first attempts Google's revocation endpoint, classifies
   any failure, and then removes stored authorized provider data. A transient
   revocation failure remains visible and retryable instead of reporting a
   successful disconnect.
4. Bluesky instructions require a dedicated revocable App Password and never
   ask a user to disable two-factor authentication or provide an account
   password.
5. Mastodon dynamically registers and stores an encrypted application per
   user-selected instance. A global Mastodon URL/client secret is not a launch
   prerequisite.

### Consequences

- TikTok posting gains an explicit API field for required user consent; old
  callers must add it for TikTok destinations.
- Production media hosting must be stable, HTTPS, and verified in TikTok's URL
  properties before Direct Post audit submission.
- A Google outage may temporarily prevent disconnect, but the UI cannot claim
  revocation happened when it did not.
- Federated Mastodon support works across instances without operator-managed
  credentials for every server.

### Rejected alternatives

- **Rely on a prior TikTok connection snapshot:** rejected because the current
  posting-context requirements can change between connection and compose.
- **Delete only the local Google token:** rejected because YouTube policy
  requires easy programmatic revocation and timely authorized-data deletion.
- **Keep one static Mastodon server:** rejected because it contradicts the
  advertised Mastodon integration and the network's federated architecture.

## ADR-015 - Public legal identity is required configuration, not placeholder copy

Status: accepted  
Date: 2026-08-11  
Applies to the public website and release preflight

### Context

The public Privacy and Terms routes are reachable but label themselves as draft
templates. They omit the operator's legal identity and the Google/YouTube
Limited Use, revocation, and deletion disclosures reviewers require. Inventing
an entity, address, jurisdiction, or effective date would be misleading.

### Decision

1. Render complete privacy, terms, and deletion disclosures from explicit
   operator-owned public environment values for legal entity, address,
   privacy/support contacts, governing jurisdiction, and effective date.
2. Production preflight rejects missing, example, or placeholder legal values.
   Local development may render clearly marked local placeholders without
   being mistaken for a deployable configuration.
3. Privacy copy discloses platform data access/use/storage/sharing, Google API
   Services User Data Policy Limited Use compliance, security-settings and
   revocation links, retention/deletion behavior, subprocessors, and contact
   paths. It never promises practices that runtime deletion does not enforce.
4. The public reviewer page, privacy page, terms page, deletion page, status
   page, and support contact must share the production origin and be available
   without authentication before any review submission.

### Consequences

- The operator must provide truthful company information before deployment;
  application secrets alone are intentionally insufficient for first launch.
- Legal review remains an operator responsibility, but the repository will no
  longer ship an obviously unreviewable draft or silently substitute fiction.

### Rejected alternatives

- **Hard-code a guessed legal entity:** rejected because false legal identity
  is worse than a fail-closed deployment.
- **Hide the draft banner without completing the policy:** rejected because
  reviewers evaluate substance and consistency, not only page availability.

## ADR-016 - Definitive Google revocation triggers bounded automatic erasure

Status: accepted  
Date: 2026-08-11  
Applies to YouTube OAuth refresh, disconnect, and authorized-data retention

### Context

An in-product disconnect can revoke Google authorization before deleting local
data, but a user can also revoke Publishly from Google Account settings. If a
dormant YouTube connection is checked only when the next post is sent, the
public seven-day deletion promise is not enforceable. Conversely, deleting a
connection on a timeout, rate limit, or Google 5xx would turn a recoverable
provider outage into irreversible customer data loss.

### Decision

1. Run the existing durable token-refresh workflow for every newly connected
   YouTube account. Google access tokens are therefore probed at their supplied
   expiry (normally about hourly), even when no post is being attempted.
2. Treat only a provider-authenticated, YouTube-specific `invalid_grant` or an
   equivalent explicit expired/revoked-token response as definitive external
   revocation. Network errors, 429s, 5xx responses, malformed responses, and
   generic authentication failures remain visible reconnect failures and do
   not erase the connection automatically.
3. Before erasure, persist the classified token-invalidation event and attempt
   the reconnect notification. Then remove credentials and provider-derived
   profile, analytics, inbox, plug, external comment, platform identifier, URL,
   and receipt-evidence data through the same transactional local purge used by
   explicit disconnect. Retain only the minimum classified operational and
   successful-usage ledgers needed for reliability, billing, abuse prevention,
   and legal obligations.
4. If the purge transaction fails, surface the error to Temporal so its bounded
   activity retry policy retries it. Never report an erased connection until
   the transaction commits.

### Consequences

- Direct Google revocation is normally detected and purged within one access-
  token lifetime, comfortably inside the public seven-day maximum.
- A revoked connection disappears from the active fleet and must be connected
  again; the prior token cannot be recovered.
- Existing installations should reconnect any legacy YouTube row that predates
  the per-connection refresh workflow, or run the documented migration canary,
  before making the retention promise publicly.

### Rejected alternatives

- **Probe only at publish time:** rejected because dormant accounts could retain
  authorized data indefinitely.
- **Erase on every refresh error:** rejected because transient infrastructure
  or provider failures are not proof that a user revoked consent.
- **Keep provider identifiers in receipts indefinitely:** rejected because the
  aggregate success ledger does not require platform post IDs or URLs.

## ADR-017 - The status authority records fresh evidence before accepting traffic

Status: accepted  
Date: 2026-08-11  
Applies to backend bootstrap and the public status ledger

### Context

The public status page correctly treats evidence older than 150 seconds as an
outage. During a cold deployment, however, the API could become reachable after
the prior sample had gone stale and then wait up to another minute for the next
cron boundary. That advertised an avoidable outage even when the database and
Redis were already healthy. Disabling `RUN_CRON` locally also made a running
single-node demo remain red indefinitely.

### Decision

1. The one backend instance designated with `RUN_CRON=true` must run the same
   database/Redis probe during Nest application bootstrap and await the status-
   ledger write before the HTTP listener is considered ready.
2. A bootstrap probe failure is logged with the machine-readable
   `status_probe_bootstrap_failed` code and rethrown. The designated status
   authority must not accept traffic while unable to publish its own evidence.
3. Instances without `RUN_CRON=true` do not write bootstrap or scheduled
   samples. Production continues to designate exactly one authority, preventing
   replicas from inflating uptime sample counts or racing on the same bucket.
4. The scheduled probe remains the ongoing heartbeat; bootstrap is an immediate
   first sample, not a replacement for the durable cadence.

### Consequences

- A healthy deployment refreshes API, database, and Redis evidence before it is
  eligible for traffic, so the public page recovers as soon as startup succeeds.
- A bad database or unwritable status ledger fails startup visibly instead of
  serving a green application shell with stale operational evidence.
- Local operators who want a truthful live status page must enable
  `RUN_CRON=true`, just as the production compose topology already does.

### Rejected alternatives

- **Increase the stale threshold:** rejected because it would hide real probe
  loss and weaken the status page's reliability claim.
- **Assume healthy at process start:** rejected because process existence is not
  evidence that the database, Redis, or status ledger works.
- **Let every replica write samples:** rejected because status ownership and
  rolling uptime denominators would become deployment-count dependent.

## ADR-018 - Cold-start grace is generous, but traffic readiness remains strict

Status: accepted  
Date: 2026-08-11  
Applies to the production Compose health policy

### Context

The backend and orchestrator eagerly load the provider registry and Temporal
workflow bundles. On a cold or resource-constrained host this can take several
minutes. The former 30-45 second health-check grace could mark those containers
unhealthy before they had a chance to bind, even though the processes were
still making progress and ultimately passed every readiness check.

### Decision

1. Give the backend and orchestrator a ten-minute health-check `start_period`.
   A passing check still marks the service healthy immediately; the grace only
   prevents startup failures from consuming the retry budget too early.
2. Keep the actual probes strict: the backend must prove database and Redis
   access plus its bootstrap status-ledger write, and the orchestrator must
   prove a recent durable publishing-engine heartbeat.
3. Keep Caddy dependent on both services becoming healthy, so no public API
   traffic is routed merely because a process exists.

### Consequences

- First deployment and cold recovery tolerate slow module/workflow loading
  without a false unavailable state.
- A service that never becomes ready remains unavailable and visible after the
  grace/retry window; the change does not turn startup time into a green state.

### Rejected alternatives

- **Probe process existence:** rejected because it says nothing about storage,
  Temporal, or the status ledger.
- **Route during warm-up:** rejected because it would expose connection errors
  and contradict the reliability position.

## ADR-019 - Optional compatibility channels are disabled unless their Publishly client exists

Status: accepted  
Date: 2026-08-11  
Applies to browser-extension integrations and provider availability

### Context

Skool is an optional upstream compatibility integration and is not one of the
ten networks advertised on the Publishly website. The provider registry treated
it as configured even when this deployment had no extension ID or Publishly
Chrome Web Store URL. Attempting to connect could then offer the upstream
Postiz extension, whose origin allowlist and identity do not match Publishly.

### Decision

1. Treat the Skool adapter as configured only when both `EXTENSION_ID` and
   `NEXT_PUBLIC_CHROME_EXTENSION_URL` are supplied for a reviewed, Publishly-
   branded extension release.
2. Never fall back to another product's extension or marketplace listing. If a
   configured extension is not reachable, show the configured Publishly link;
   if there is no link, show an explicit administrator-configuration message.
3. Keep Skool outside the advertised launch-provider manifest and production
   secret requirements. It remains disabled by default and cannot affect the
   ten-provider website promise.

### Consequences

- The Connect UI cannot imply that a browser-cookie adapter is available when
  its exact client is absent.
- Shipping this optional channel later requires a separate extension review,
  correct production-origin allowlist, ID/URL configuration, and canary.

### Rejected alternatives

- **Link to the upstream Postiz extension:** rejected because its identity and
  permitted origins belong to a different product.
- **Leave the tile active and fail after the warning:** rejected because a
  known configuration failure should be surfaced before the user starts.

## ADR-020 - Public website clients use a same-origin API fallback

Status: accepted  
Date: 2026-08-11  
Applies to public status/deletion clients and direct frontend deployments

### Context

Production supplies `NEXT_PUBLIC_BACKEND_URL` at image-build time and Caddy
routes `/api/*` to the backend. A direct `next build && next start`, however,
does not load the repository-root environment during the build. Public client
widgets then compiled an empty backend origin and requested `/public/status`
from Next, which is a website route rather than an API route.

### Decision

1. Public browser clients default to the same-origin `/api` prefix when no
   explicit public backend origin was compiled in.
2. Next rewrites `/api/:path*` to `BACKEND_INTERNAL_URL`, defaulting to
   `http://localhost:3000` for a direct local production build. Production
   images receive the internal backend URL explicitly; the edge still handles
   public `/api/*` requests before they reach Next.
3. The frontend proxy permits `/api/public/*` to reach that rewrite without an
   application-session redirect. Authentication and scoped API-key enforcement
   remain the backend's responsibility.
4. One shared, tested URL builder is used for public status, homepage proof,
   and Meta deletion-status lookup.

### Consequences

- The website's live reliability proof and deletion lookup work in Docker,
  behind the production edge, and under a direct compiled local launch.
- Missing public build configuration no longer silently changes the API path;
  unreachable backend responses still render the explicit unavailable state.

### Rejected alternatives

- **Require a special dotenv build script locally:** rejected because the
  standard repository build should produce a coherent runnable artifact.
- **Default to `/public/*`:** rejected because that collides with Next routes
  and bypasses the production edge's documented `/api` contract.

## ADR-021 - Product previews own their theme canvas and make demo data explicit

Status: accepted  
Date: 2026-08-12  
Applies to public marketing product replicas and analytics previews

### Context

The product-preview wrapper changed its descendants to dark-theme color tokens
without painting a dark canvas. White labels and translucent chart marks were
therefore rendered against the light marketing page and appeared blank. The
analytics preview also encoded its series as pixel heights, which provided no
visible scale, dates, values, or clear distinction between demo observations
and authenticated platform data.

### Decision

1. A themed product-preview boundary must paint the canvas that its color
   tokens assume; descendants cannot rely on an unrelated ancestor to supply
   contrast.
2. Analytics previews use dated numeric observations and derive bar heights
   from those values. They show a scale, period total, change, source label,
   refresh time, and explicit unavailable metrics.
3. Public marketing data is labelled as a demo. Only the authenticated product
   may describe account-specific values as live platform data.
4. Chart text and marks must retain useful contrast without animation, hover,
   or JavaScript, and the complete series remains available to assistive
   technology.

### Consequences

- Product replicas remain legible anywhere they are embedded, including the
  light analytics page.
- Visitors can read the chart rather than infer meaning from decorative bars,
  while Publishly does not misrepresent hardcoded marketing data as a connected
  customer's platform report.

### Rejected alternatives

- **Increase only the bar opacity:** rejected because the text, borders, and
  every other dark-token descendant would remain unreadable.
- **Fetch a customer's analytics on the public route:** rejected because the
  page is unauthenticated and must not expose or imply access to private data.

## ADR-022 - Page-level color fields are full bleed; live freshness uses restrained motion

Status: accepted  
Date: 2026-08-12  
Applies to the public marketing shell and live/fresh status indicators

### Context

The homepage's primary color field was implemented as a large card inside a
symmetrically reserved scrollbar gutter and an additional 12-pixel wrapper.
On desktop this produced an unintended pale rail on both sides, a gap beneath
the navigation, and rounded page-level corners that made the whole site feel
confined. The account-health preview's green “Updated just now” dot was also
static, so it did not visually communicate that the state is actively fresh.

### Decision

1. Page-level backgrounds and primary brand color fields run to the content
   viewport edges. Borders, radii, and shadows remain available for actual
   components inside the page, not for the page canvas itself.
2. Inner content retains a centered maximum width and responsive horizontal
   padding, so full bleed does not mean copy or controls touch the viewport.
3. Reserve scrollbar space only on the scrollbar edge. Do not mirror an empty
   scrollbar rail onto the opposite side of the page.
4. A live freshness dot may pulse at a calm, regular cadence. The label remains
   readable and static, the dot never disappears completely, and
   `prefers-reduced-motion: reduce` disables the animation.

### Consequences

- Desktop pages use the full available canvas without looking like a rounded
  card floating inside another page.
- Navigation and hero content keep deliberate alignment and safe gutters while
  the blue field itself reaches the edges.
- Freshness has a visible cue without turning operational status into a
  distracting alarm or disregarding motion preferences.

### Rejected alternatives

- **Keep the outer card and only reduce its margin:** rejected because even a
  smaller rail preserves the same nested-page visual problem.
- **Remove all borders site-wide:** rejected because component boundaries such
  as terminals, receipts, tables, and previews still benefit from borders.
- **Fast blinking:** rejected because it reads as an error state and can create
  accessibility problems; freshness should pulse, not alarm.

## ADR-023 - Marketing rails expand fluidly on wide and zoomed-out desktops

Status: accepted  
Date: 2026-08-12  
Supersedes ADR-022 decision 2 where it implied the former fixed desktop cap

### Context

Removing the homepage's outer card exposed a second constraint: shared
marketing content still stopped at 1,120 pixels and the homepage stage stopped
at 1,180 pixels. On a wide monitor—or at a zoom level that creates a wide CSS
viewport—this compressed every meaningful element into a narrow center strip
and left two large, visually bordered side rails inside an otherwise full-width
background.

### Decision

1. The shared marketing rail may grow to 1,920 pixels with responsive gutters;
   it is no longer optimized only for laptop-width screens.
2. The homepage proof stage uses a viewport-derived width with a 2,080-pixel
   ceiling. At ordinary desktop widths it keeps roughly 5–7vw of combined side
   breathing room; at ultra-wide widths the ceiling prevents uncontrolled
   stretching.
3. The hero columns become more balanced so the headline and proof surface both
   gain useful width. Individual paragraphs and headings retain their own line-
   length limits; widening the layout does not create unreadably long copy.
4. The two-column hero stacks before either column becomes cramped. Tablet and
   mobile behavior remains single-column.

### Consequences

- Wide and zoomed-out desktops use substantially more of the screen instead of
  presenting a narrow central page inside a full-width color field.
- Navigation, product grids, and editorial splits share a more natural modern
  desktop rail while copy remains readable.
- Laptop, tablet, and phone layouts continue to be governed by their existing
  responsive breakpoints and gutters.

### Rejected alternatives

- **Remove every maximum width:** rejected because terminals, tables, and copy
  would become difficult to scan on ultra-wide displays.
- **Scale the typography to fill the empty space:** rejected because the issue
  is layout allocation, not insufficient font size.
- **Center the existing 1,180-pixel stage more precisely:** rejected because
  centering does not solve the excessive unused width.

## ADR-024 - Brand lockups are transparent and previews use real authentication

Status: accepted  
Date: 2026-08-12  
Applies to marketing chrome, local product previews, and authentication tests

### Context

The marketing navigation and footer loaded a 1,220-by-380 PNG whose pixels
included a white background. CSS cropping and blend modes hid part of that
matte on some surfaces, but the navigation still exposed a visible rectangle.
The sign-up browser check proved that a new customer could enter the
authenticated application, but it did not prove that the same credentials
could sign out and sign back in; it also asserted obsolete tier names after the
billing model changed.

### Decision

1. Publishly wordmarks in website chrome are rendered from transparent,
   code-native text and vector geometry. A raster image with baked background
   pixels is not a valid source for navigation, authentication, or app chrome.
2. Product preview access uses the ordinary local registration, logout, and
   login endpoints. There is no client-side authentication bypass, magic
   production credential, or fake dashboard route.
3. A local preview account may be created in the developer database through
   the public registration flow for operator review. It is local state, not a
   seed shipped with production builds.
4. The browser contract must prove the complete credential lifecycle and the
   authenticated shell. Billing assertions use the same Starter, Growth, and
   Scale names exposed by the current pricing model.
5. Authentication failures remain visible in the form: rejected credentials
   and network errors clear the loading state and show a human-readable reason.

### Consequences

- The wordmark has no background rectangle on any page color and does not rely
  on blend modes to appear transparent.
- The operator can inspect the real application with a normal account while
  production security and account boundaries remain unchanged.
- A passing entry-point test can no longer conceal a broken returning-user
  login or drift between website and in-app pricing.

### Rejected alternatives

- **Remove the white pixels from the PNG:** rejected because a large raster
  remains fragile at small navigation sizes and duplicates code-native brand
  geometry already used by the product.
- **Add a public demo-login bypass:** rejected because it would create a second
  authentication path and could expose shared state if enabled in production.
- **Stop the test after registration:** rejected because registration success
  does not prove that a returning customer can sign in.

## ADR-025 - A fail-closed tuple matrix is the only Bulk Scheduler capability authority

Status: accepted  
Date: 2026-08-12  
Applies to Bulk Scheduler API validation, product UI, documentation, marketing,
provider canaries, and production rollback controls

### Context

The existing provider capability registry describes broad adapter features such
as image, video, carousel, and story support. Those flags do not prove that a
specific account type, post type, media transport, validation path, and
confirmation read have passed the Bulk Scheduler's stronger reliability bar.
Treating one broad `video: true` flag as proof for every video workflow would
advertise combinations that have never been exercised end to end.

### Decision

1. A versioned tuple matrix in the shared helper library is the sole authored
   source for Bulk Scheduler capability. A tuple identifies provider, account
   type, post type, media kind, transport mode, validation profile, and
   confirmation method.
2. Unknown tuples and tuples without an explicit row are disabled. A tuple is
   customer-eligible only when its row is implemented, private-transport ready,
   real-provider certified, default eligible, and not disabled by either the
   global or tuple kill switch.
3. Test mocks may move an implementation field but cannot set real-provider
   certification. Certification evidence is a checked-in, redacted canary
   record produced by the controlled Stage 8 harness using a designated test
   destination.
4. API validation, authenticated UI choices, generated documentation, public
   product facts, and Bulk Scheduler marketing claims consume or are generated
   from this matrix. CI rejects generated-output drift and hard-coded tuple
   claims outside the approved generated surfaces.
5. `BULK_SCHEDULER_KILL_ALL` and a stable per-tuple kill switch remain permanent
   even after certification. Enable overrides may assist a controlled canary,
   but they can never make an uncertified tuple customer-eligible.
6. The initial matrix is deliberately narrow and video-first. It records only
   combinations whose current adapters provide a concrete mutation and
   provider-read confirmation path. Every row starts disabled until private
   transport and a real canary prove that exact tuple.

### Consequences

- Product surfaces cannot infer Bulk Scheduler support from broad provider
  flags or from another tuple on the same platform.
- A passing adapter unit test is useful implementation evidence but never a
  public support claim.
- Production operators can disable the entire scheduler or one exact tuple
  without a deploy, while disabled/unknown combinations remain unavailable by
  default.

### Rejected alternatives

- **Reuse the broad provider-capability map:** rejected because it lacks post
  type, account type, private transport, confirmation, and certification
  dimensions.
- **Allow environment variables to opt any tuple in:** rejected because a
  typo or stale deployment setting could advertise unproved behavior.
- **Maintain separate backend, frontend, and marketing lists:** rejected
  because they inevitably drift and can expose a tuple the API rejects.

## ADR-026 - Bulk Scheduler staged execution: mapping, verified state, and local-only checkpoint constraint

Status: accepted  
Date: 2026-08-12  
Applies to Bulk Scheduler implementation stages 1-8 and their checkpoints

### Context

The operator directed execution of the Bulk Scheduler as eight ordered stages
derived from nine execution rules, recording each stage's decision here before
implementing it. Stage 1's capability authority is already accepted (ADR-025).
This ADR records the stage mapping, the independently verified current state,
and two operative constraints discovered at execution start, so later stages
build on a truthful baseline rather than an assumed one.

### Decision

1. Stage mapping (rules -> stages): S1 fail-closed tuple matrix (ADR-025); S2
   narrow video-first MVP plus campaign-intent and issue ledgers
   (DB-authoritative, tenant-keyed, stable issue codes, cursor pagination,
   audit events, contract tests); S3 private provider-pull media (private
   storage + job-scoped short-lived access, per-tuple TTL/fetch); S4 one generic
   reservation ledger in shadow mode plus verified backfill; S5 migrate every
   calendar-writing path through the cutover gate and add the CI architecture
   guard; S6 preserve V109 as
   the only publishing execution path, adding the campaign gate, short-horizon
   materializer, durable attempts, and ambiguous-outcome reconciliation
   (accepted-then-timeout -> provider readback, never blind repost, else
   NEEDS_REVIEW); S7 mandatory 100,000-item and tenant-isolation suites with
   machine-readable benchmark artifacts; S8 real-provider canary certification
   through a designated test destination. Cross-cutting: permanent global
   (`BULK_SCHEDULER_KILL_ALL`) and per-tuple kill switches survive launch.

2. Verified current state (2026-08-12): S1 COMPLETE and green.
   `data/bulk-scheduler-capabilities.json` holds nine video tuples (instagram
   reel, facebook feed, tiktok direct, youtube video, x post, threads post,
   linkedin member + organization, pinterest video pin), every one
   `defaultEligible:false`, `certificationStatus:not_run`,
   `privateTransportReady:false` -> all disabled, as required.
   `capability.matrix.ts` decision engine + `capability.matrix.spec.ts` pass
   5/5 (`pnpm exec jest --selectProjects unit --testPathPattern
bulk-scheduler/capability.matrix`): unknown-tuple fail-closed,
   no-advertise-before-transport-and-canary, kill-switch precedence,
   canary-cannot-bypass-unfinished-transport, video-first-only. Generator
   scripts, generated docs, and `provider.capabilities.ts` consumption present.
   S2-S8 are not yet built (no campaign-intent/issue/reservation Prisma models;
   no V109 campaign gate; no 100k/isolation suites; no canary evidence).

3. Constraint - checkpoints are LOCAL commits only. The sole git remote is the
   PUBLIC `upstream` (github.com/gitroomhq/postiz-app.git); no private origin
   exists. Per the owner's privacy absolute, stage checkpoints are local commits
   on a feature branch and nothing is ever pushed from this repository.

4. Constraint - baseline must be established before migrations. `main` carries
   365 uncommitted files. Stages 3 and 5 require backward-compatible migrations
   that must not break production users; a migration authored on top of an
   unverified dirty schema cannot prove backward compatibility. Therefore the
   current WIP is characterized and checkpointed to a known-green baseline
   before any new migration is authored.

### Consequences

- Every stage lands as a local feature-branch checkpoint with its own tests and
  evidence; the public upstream is never pushed.
- The immediate next action is baseline characterization + a clean Stage-1/2
  checkpoint, then Stage 3.

### Rejected alternatives

- **Author Stage 3/5 migrations directly on the 365-file dirty `main`:**
  rejected because backward compatibility cannot be proven without a known
  baseline, and it risks entangling unrelated in-flight work.
- **Push checkpoints to a remote:** rejected because the only remote is public;
  the privacy absolute forbids it.

## ADR-027A - Bulk Scheduler MVP is narrow, video-first, and every advertised surface derives from the matrix

Status: accepted  
Date: 2026-08-12  
Applies to Bulk Scheduler stage 2 (narrow MVP) and generated-surface drift

### Context

Stage 1 established the fail-closed tuple matrix authority (ADR-025). Stage 2
fixes MVP scope: the matrix stays deliberately narrow so certifying one tuple
never implies another, and every customer-facing surface (UI availability, API
validation, docs, marketing) is generated from the matrix so it cannot advertise
a combination the API rejects.

### Decision

1. The MVP is the nine authored video tuples only (instagram reel, facebook
   feed, tiktok direct, youtube video, x post, threads post, linkedin member and
   organization, pinterest video pin). `mediaKind` is `video` for all; no image,
   carousel, story, or text tuple is authored. All nine are
   `defaultEligible:false`, `certificationStatus:not_run`,
   `privateTransportReady:false` -> disabled.
2. Certifying one tuple never widens another: provider, account type, post type,
   media kind, transport mode, validation profile, and confirmation method are
   all tuple-scoped. Proof is per-row, never per-platform.
3. UI availability, API validation, generated docs, and marketing claims are
   produced by `scripts/generate-bulk-scheduler-capabilities.mjs` from the same
   JSON matrix. `--check` is the drift guard: a mismatch exits non-zero and
   blocks CI.
4. Evidence (2026-08-12): `node scripts/generate-bulk-scheduler-capabilities.mjs
--check` -> exit 0 (no drift); `capability.matrix.spec.ts` 5/5 green.

### Consequences

- No surface can advertise a tuple the matrix disables; adding a tuple requires
  an authored row plus regeneration and, later, its own transport + canary.
- Widening the MVP (image, carousel, story, more account types) is an explicit
  future matrix change, not a silent capability inference.

### Rejected alternatives

- **Advertise broad "video supported" per platform:** rejected; one video tuple
  is not proof for another post type, account type, or media path.
- **Maintain UI/API/docs lists by hand:** rejected; they drift from the matrix
  and can expose a tuple the API rejects.

## ADR-027B - Campaign intent is append-only and every campaign problem is a durable issue

Status: accepted  
Date: 2026-08-12  
Applies to Bulk Scheduler campaign creation and editing, issue visibility,
tenant isolation, audit history, and API pagination

### Context

Bulk campaigns must survive retries, concurrent edits, process crashes, and
large asynchronous planning runs without treating a queue payload as state.
They must also make blocked, failed, conflicted, quarantined, and overflow work
visible with a stable machine code and a useful reason. Replacing one mutable
JSON campaign document would lose the exact intent that produced a plan, while
free-form error strings would recreate silent failure at campaign scale.

### Decision

1. `BulkCampaign` is the tenant-scoped current projection: lifecycle state,
   current intent revision, idempotency hashes, timestamps, and aggregate
   counters. `BulkCampaignIntent` is an append-only revision ledger containing
   the canonical versioned JSON intent and its SHA-256 hash. Optimistic revision
   comparison serializes concurrent edits; an exact retry replays safely.
2. `BulkCampaignIssue` is an idempotent event ledger. Every row requires an
   issue class (`blocked`, `failed`, `conflicted`, `quarantined`, or
   `overflow`), the existing failure taxonomy, a registry-backed stable code,
   and a non-empty human reason. Resolution changes status but never deletes
   the original event.
3. Campaign, intent, and issue relations carry `organizationId` in composite
   unique and foreign keys. Every repository read and mutation also predicates
   on the caller organization. A valid identifier from another tenant is
   indistinguishable from a missing identifier at the API boundary.
4. Creation requires an idempotency key and persists campaign, first intent,
   and audit event in one transaction. Edits use expected revision and persist
   the next intent plus audit event atomically. Deterministic audit identifiers
   prevent retry-created duplicate audit rows.
5. Campaign and issue collections use bounded cursor pagination ordered by a
   timestamp plus ID tie-breaker. Invalid cursors fail explicitly; offset
   pagination is not used for asynchronous fleet-scale collections.
6. Database enums and CHECK constraints enforce states, positive revisions,
   JSON-object intent, paired issue subjects, non-empty codes/reasons, and
   coherent resolution timestamps. Queues may carry IDs only and can never
   author or replace campaign state.
7. Public campaign creation validates exact destination tuples through the
   Stage 1 matrix and validates each connection inside the tenant. Since no
   tuple is certified yet, the public API remains deliberately fail-closed
   while the ledger and later canary path can be fully tested internally.

### Consequences

- Replanning can cite an immutable intent revision and cannot observe a
  half-written edit.
- Every customer-visible campaign problem has a durable API representation;
  one bad item does not need to fail or erase the rest of the campaign.
- Append-only intent revisions and bounded pages add small storage overhead in
  exchange for deterministic recovery and auditability.

### Rejected alternatives

- **Store only mutable intent JSON on the campaign row:** rejected because it
  destroys the source intent for prior reservations and ambiguous retries.
- **Use log messages or queue dead letters as the issue ledger:** rejected
  because neither is authoritative, tenant-queryable product state.
- **Trust controller scoping without composite tenant foreign keys:** rejected
  because a missed predicate could attach another tenant's child record.
- **Allow arbitrary issue codes:** rejected because clients, alerts, runbooks,
  and tests require a stable contract.

## ADR-028 - Provider media uses private objects and job-scoped revocable capabilities

Status: accepted  
Date: 2026-08-12  
Applies to Bulk Scheduler video storage, direct provider uploads, provider-pull
URLs, request logging, provider retries, and media access audit

### Context

Several existing adapters accept a public media URL because the provider pulls
the file asynchronously. Bulk Scheduler may not expose public object URLs, and
it cannot issue one unbounded URL that permits any job or tenant to fetch any
asset. At the same time, Meta-family providers legitimately issue HEAD, Range,
or repeated GET requests while processing a video, so mandatory single-use
links would turn reliable publishing into a race.

### Decision

1. Bulk video bytes are stored only through `PrivateMediaStorage`, in a
   namespace/bucket with no public URL. Production object storage requires a
   distinct private bucket; local private storage resolves outside the public
   upload directory. The application streams reads and never redirects a
   provider to an object-store URL.
2. `BulkAsset` is the tenant-scoped immutable media identity (private storage
   key, SHA-256, MIME, size, state). `BulkCampaignAsset` relates assets to
   campaigns. `BulkPublishingJobAsset` is the authorization ledger that binds
   an exact tenant, V109 publishing job, and asset. Cross-tenant composite
   foreign keys enforce each relationship.
3. A `ProviderMediaGrant` can be created only for an existing
   `BulkPublishingJobAsset` row and an exact provider-pull tuple whose provider
   matches the publishing job. The URL contains a random 256-bit capability;
   only its SHA-256 is stored. Grants expire, revoke, and count fetches
   durably. They never contain a public storage URL, OAuth credential, tenant
   ID, or storage key.
4. Fetch behavior is matrix-owned per exact tuple. Instagram reels and Threads
   videos permit HEAD/Range and repeat fetches for four hours; Facebook Page
   feed video permits the same for 24 hours because provider processing may be
   longer. Repeat fetches are bounded by expiry rather than single-use. Direct
   upload tuples never receive provider-pull capabilities and read the same
   private object through an internal job-scoped stream.
5. Every fetch for a known grant creates `ProviderMediaFetchEvent` state and is
   completed as served or classified failure. Unknown, malformed, tampered,
   expired, revoked, over-limit, invalid-range, unrelated-job, and storage-read
   failures emit structured metrics/logs without including the capability or
   storage key. Customer/campaign issues are added by the Stage 6 materializer
   when a transport failure affects dispatch.
6. The public endpoint is a capability endpoint, not a public-media endpoint:
   it has no listing or object identifier route, sends `no-store`, supports
   HEAD and a single RFC 7233 byte range, and streams bytes without buffering.
   Request-path and failure-reason redaction replace its capability segment
   before application logs are written. Edge/proxy access-log redaction is a
   production prerequisite recorded in the runbook.
7. Private transport readiness in the tuple matrix means the implementation,
   adversarial contracts, and configuration preflight exist. It does not mean
   the tuple is customer eligible; real-provider certification and explicit
   default eligibility remain separate Stage 8 gates.

### Consequences

- A copied provider URL is useful only for one linked job/asset and only until
  its expiry or revocation; it cannot enumerate or address another object.
- Providers can legitimately re-fetch and range-read without weakening tenant
  or job isolation.
- The backend carries media egress and must be horizontally sized for provider
  pulls; direct object-store redirects are intentionally forbidden.
- A distinct private bucket/directory and edge log-scrubbing rule become
  deployment requirements before canaries.

### Rejected alternatives

- **Use existing `Media.path` public URLs:** rejected because possession gives
  unbounded public object access and there is no job/expiry boundary.
- **Return an S3/R2 presigned object URL directly:** rejected because storage
  credentials and object policy become the externally observable contract,
  fetch auditing is incomplete, and job linkage cannot be rechecked.
- **Make every URL single-use:** rejected because certified providers may use
  HEAD, Range, retries, or asynchronous re-fetches.
- **Put the token in logs for debugging:** rejected because log access would
  become media access; only grant IDs and non-reversible token fingerprints are
  observable.

### Amendment (2026-08-13) - native resumable ingestion is a durable private-media ledger

The original decision proved private provider delivery but left customer
ingestion as a bounded internal buffer method. That does not satisfy native
multi-video/folder upload or a 1 GiB file without unbounded process memory.
Before completing Stage 6, Publishly therefore adopts these additional rules:

1. One `BulkUploadSession` represents one file selected from a native file or
   folder picker. It records tenant + campaign, client file identity and
   relative path, expected size, fixed server chunk size, received totals,
   lifecycle state, lease, final asset, metadata, and a mandatory failure
   class/code/reason for every quarantined or failed file. `BulkUploadPart` is
   the immutable hash/size/private-key ledger for each received part. Batch and
   part retries are content-idempotent; reuse with different bytes is a
   classified conflict.
2. Chunks are at most 8 MiB in application memory. Composition, hashing,
   probing, thumbnail generation, and optional normalization stream through a
   private object or an owner-only temporary file. A worker claims a bounded
   number of database sessions with leases; no HTTP request, queue message, or
   Temporal history becomes upload truth.
3. Final validation uses byte sniffing plus `ffprobe`. Corrupt/non-video files
   are quarantined independently. Inputs outside the canonical H.264/yuv420p
   MP4 profile are normalized with `ffmpeg`, re-probed, hashed, and stored as a
   new private immutable asset. Thumbnails are private and exposed only through
   a tenant-authenticated streaming endpoint. Missing binaries or storage
   errors are recoverable failures, never accepted media.
4. Exact SHA-256 duplicates are quarantined with `duplicate_media` rather than
   silently expanding another publish job. Completion atomically links a READY
   `BulkAsset` to the campaign at its stable position; one bad file cannot roll
   back another upload or campaign item.
5. Browser folder selection is only a convenience over the same per-file
   protocol: CSV and public media URLs are never required. List/status APIs are
   cursor-bounded and expose missing parts and every terminal reason.

This amendment retains every original provider-capability and storage boundary;
it adds the missing ingress half without creating another media or publisher
path.

## ADR-029 - One tenant-scoped calendar reservation ledger shadows legacy posts before enforcement

Status: accepted  
Date: 2026-08-13  
Applies to Bulk Scheduler Stage 4, calendar slot ownership, conflict locking,
legacy backfill, shadow comparison, and the Stage 5 writer cutover

### Context

Today the calendar is represented implicitly by `Post.publishDate`. The
composer, public API, MCP tool, bulk import, autopost, generated drafts, fleet
distribution, duplicate/reschedule, and delete flows eventually call
`PostsService`, while date mutation and soft deletion write `Post` in
`PostsRepository`. A Bulk Scheduler-only slot table would leave those paths
invisible and could double-book an account. Enforcing a new uniqueness rule
immediately is also unsafe: existing posts may already share an exact account
and timestamp, and historical timezone intent was not persisted.

### Decision

1. `CalendarReservation` is the only generic slot-ownership ledger. It carries
   `organizationId`, `integrationId`, generic owner type/ID, optional post or
   campaign linkage, UTC `scheduledAt`, original timezone/local wall-clock
   intent plus offset/fold, pinned state, writer/source, revision, durable
   state/code/reason, and an idempotency key. Queues never author reservation
   state.
2. Reservation modes are `SHADOW` and `AUTHORITATIVE`. Shadow rows may expose
   existing conflicts without blocking production. Only authoritative rows in
   `HELD` or `COMMITTED` state own a slot, enforced by a PostgreSQL partial
   unique index on tenant + integration + UTC instant.
3. Authoritative acquisition runs in one transaction, takes a PostgreSQL
   transaction advisory lock derived from the exact tenant/account/instant,
   rechecks active ownership, and then inserts. A conflict is returned and
   persisted with a stable class/code/reason rather than skipped. Exact
   idempotency replay returns the existing reservation; key reuse with different
   intent fails explicitly.
4. State transitions are constrained and compare an expected revision:
   `HELD -> COMMITTED|RELEASED|CANCELLED|CONFLICTED`, `COMMITTED ->
RELEASED|CANCELLED`, with terminal rows retained. Leases bound abandoned
   holds. Published or manually pinned reservations are not silently moved;
   Stage 6 replanning creates new future unpinned revisions only.
5. Backfill is restartable and keyset-paged in bounded transactions. Every
   non-deleted legacy `Post` receives a deterministic shadow identity and
   `UTC`/offset-zero local intent because earlier timezone intent cannot be
   reconstructed honestly. Exact duplicate legacy slots remain separate shadow
   rows and are reported as durable conflict observations.
6. Shadow verification compares every eligible `Post` to its reservation and
   reports missing, extra, timestamp, account, tenant, and state mismatches with
   bounded cursor output and aggregate metrics. Cutover is forbidden until a
   complete backfill has a verified watermark and zero unexplained mismatches.
7. Stage 4 adds the ledger, service, migration, backfill/verifier, API-safe
   reads, metrics, alerts, and rollback controls but does not switch calendar
   writers. Stage 5 will route every inventoried writer through the same service
   and add a CI guard against new direct calendar writes.

### Consequences

- Existing calendars remain operational during shadowing, while conflicts and
  drift become measured data rather than deployment surprises.
- Exact-slot serialization works even when no slot row exists yet, without a
  giant campaign transaction.
- The ledger retains state history and local-time intent at some storage cost;
  bounded pagination and indexes keep reads predictable.

### Rejected alternatives

- **Make `Post.publishDate` itself the lock:** rejected because planned campaign
  slots exist before posts materialize and not every reservation has a Post.
- **Create a Bulk Scheduler-only calendar:** rejected because legacy, fleet,
  API, MCP, autopost, and import writers could collide invisibly.
- **Enforce unique legacy slots during migration:** rejected because unknown
  existing duplicates would make deployment fail or silently drop posts.
- **Use Redis/Temporal as slot authority:** rejected because locks and queue
  messages can expire or replay; PostgreSQL is the source of truth.
- **Infer historical customer timezones:** rejected because an invented local
  intent is worse than an explicit UTC backfill marker.

## ADR-030 - Every calendar writer crosses one verified reservation cutover gate

Status: accepted  
Date: 2026-08-13  
Applies to Bulk Scheduler Stage 5, post creation, drafts, rescheduling,
deletion, shadow dual-write, authoritative cutover, and writer architecture CI

### Context

All current production calendar entry points eventually call `PostsService`,
but the actual `Post.publishDate` mutations still occur in `PostsRepository`.
The entry points include the dashboard composer/calendar, authenticated and
public APIs, MCP scheduling, CSV bulk import, autopost, generated drafts, fleet
distribution, settings edits, duplicate/edit saves, date changes, and delete.
The complete mutation audit also found post retirement inside connection
replacement/deletion, workspace erasure, and Meta erasure; those are calendar
writers even though they are not scheduling UI surfaces.
Switching only the future Bulk Scheduler materializer would therefore leave
other writers able to bypass conflict protection. Enforcing globally before a
tenant's legacy snapshot is verified could also allow an old Post and a new
authoritative reservation to own the same account/instant unnoticed.

### Decision

1. `PostsService` is the single calendar-writer boundary. Every current entry
   point continues to reuse it. A dedicated `PostCalendarWriterService` owns
   reservation preparation, shadow mirroring, commit/abort, reschedule, and
   cancellation; callers may not write `Post.publishDate` directly.
2. A new post receives a stable root Post ID before persistence. In
   authoritative mode the writer first acquires a leased `HELD` reservation
   whose owner ID is that future Post ID, materializes the Post, then attaches
   the tenant-qualified Post and commits the hold before creating a publishing
   job or starting V109. A materialization failure releases the hold with a
   durable class/code/reason. A crash leaves a recoverable leased hold and no
   dispatch; replay repairs the same identity and never allocates a second
   slot.
3. During shadow mode the existing Post write remains customer-compatible and
   is immediately mirrored with a deterministic idempotency key before any
   publishing job or workflow starts. Mirror failure is classified and
   surfaced; it is never logged-and-ignored. Exact retries repair the gap.
4. Authoritative mode is permitted only when the deployment enforcement flag
   is on and that tenant's fixed-watermark backfill is `VERIFIED`. If global
   enforcement is requested for an unverified tenant, the write fails closed
   with a stable recoverable code. Turning enforcement off returns the tenant
   to shadow dual-write. `CALENDAR_RESERVATION_KILL_ALL` remains permanent and
   blocks calendar mutations rather than falling back to an unledgered write.
5. Reschedule takes a tenant/post advisory lock, rechecks the target slot,
   persists a conflicted attempt when occupied, and otherwise changes
   `Post.publishDate`, commits the replacement reservation, and releases the
   prior unpinned reservation in one database transaction. Automatic callers
   cannot move pinned/published slots; an explicit user republish action is a
   separate revision and retains the historical pinned reservation.
6. Delete/cancel updates the Post group and active unpinned reservations in one
   transaction. Connection replacement/deletion, workspace erasure, Meta
   erasure, and composer group retirement call the same transaction-level
   cancellation primitive. Published/pinned history is retained.
   Settings-only updates ensure the current reservation exists but do not
   create a new revision.
7. New schedule intent accepts IANA timezone, local wall-clock text, UTC offset,
   and DST fold. Legacy callers remain backward compatible by recording an
   explicit `UTC`/zero-offset intent; the system never invents a local zone.
8. A repository architecture guard runs in CI. It rejects production
   `publishDate` mutations outside the approved Post repository and rejects any
   production caller of its calendar-mutating methods other than
   `PostsService`/`PostCalendarWriterService`. Tests, generated Prisma code, and
   immutable migrations are excluded. The guard itself has positive and
   negative contract tests.
9. Authority promotion requires an exact shadow representation for the same
   tenant, Post, connection, and UTC instant. A missing shadow row creates an
   authoritative `CONFLICTED` attempt with
   `calendar_writer_shadow_missing`, prevents activation, and is retried only
   after the shadow gap is repaired. Promotion never fabricates proof from a
   UTC fallback.

### Consequences

- All existing calendar surfaces gain one conflict and tenant-isolation rule
  without duplicating the publisher or changing V109 dispatch.
- Post creation is intentionally two-phase around a durable hold; no workflow
  can observe the gap, and reconciliation can repair a crash from database
  state.
- Tenant-by-tenant cutover is slower than a global flip but supplies an
  evidence-backed rollback boundary and prevents unverified legacy collisions.

### Rejected alternatives

- **Keep direct Post writes and compare later:** rejected because a conflicting
  post could already be queued or published before comparison.
- **Enable authority for every tenant when the environment flag flips:**
  rejected because an unverified legacy calendar is not safe to enforce.
- **Make each controller/importer own reservations:** rejected because behavior
  and failure contracts would drift as entry points are added.
- **Start a workflow before the reservation commits:** rejected because a
  worker could publish a post whose slot was never durably owned.
- **Silently bypass the ledger during a kill switch or outage:** rejected
  because rollback must not recreate an invisible calendar writer.

## ADR-031 - Durable campaign jobs materialize through V109 and reconcile ambiguous mutations before retry

Status: accepted  
Date: 2026-08-13  
Applies to Bulk Scheduler Stage 6, deterministic planning, bounded reservation,
short-horizon materialization, private media hydration, dispatch attempts,
ambiguous provider outcomes, replanning, pause, and cancellation

### Context

The repository already has immutable campaign intents, assets, issue records,
the generic calendar reservation ledger, per-account publishing queues, and the
V109 Post workflow. It does not yet have a durable row for each expanded
campaign item, an append-only provider-attempt ledger, or a safe bridge from a
private campaign asset into V109. Starting a second publisher or treating a
queue message as the campaign record would split retry, receipt, verification,
and tenant behavior. Retrying a provider mutation after a timeout can also
double-post when the provider accepted the request but its response was lost.

### Decision

1. `BulkCampaignJob` is the durable expansion and materialization ledger. Its
   deterministic identity is derived from tenant, campaign, intent revision,
   asset, destination, and ordinal. It stores the exact tuple, planned UTC
   instant plus original timezone/local wall-clock/offset/fold, pinned state,
   reservation/Post/PublishingJob links, lease token/expiry, revision, and a
   mandatory class/code/reason for every non-success outcome. Composite tenant
   foreign keys prevent cross-workspace linkage. Cursor reads are keyset-paged.
2. Expansion is deterministic and bounded. `cross_post` produces
   `asset_count * destination_count` jobs; `distribute` produces `asset_count`
   jobs by stable round-robin destination. Upload, filename, manual, and seeded
   shuffle order are pure functions. `per_account` cadence applies the daily
   limit independently to each destination; `campaign` cadence applies it to
   the merged sequence. Capacity is the sum of usable, spacing-respecting slots
   in the inclusive date/weekdays/window interval. Overnight windows are split
   by local calendar date. A missing DST wall time is an explicit overflow;
   repeated wall time chooses fold zero deterministically and persists the fold
   and UTC offset. `best_time` remains unavailable until a matrix-backed
   implementation exists; an unknown strategy never silently degrades.
3. Planning inserts jobs in bounded chunks with idempotent deterministic keys;
   it never opens one transaction for the campaign. Reservation is also
   chunked and calls the existing `CalendarReservationService` for every job.
   Conflicts follow the intent (`next_available`, `keep_conflict`, or `stop`)
   and create durable issues. No queue owns job or slot state.
4. The materializer claims due jobs with a PostgreSQL transaction and
   `FOR UPDATE SKIP LOCKED`, short leases, and a configurable bounded batch.
   Its default horizon is 24 hours. It rechecks campaign state, intent revision,
   connection state, tuple eligibility/kill switches, asset state, and the
   committed reservation before creating a Post. Each failure affects only its
   job and emits an issue/audit/metric; another file or account continues.
5. `PostsService.createPost` gains an internal, optional materialization hook
   after its PublishingJob exists and before it starts V109. The hook atomically
   links the campaign job and private asset to that exact PublishingJob. The
   normal API contract remains backward compatible. V109 is still the only
   workflow started for campaign posts; no campaign worker calls an adapter.
6. Campaign Posts persist only an opaque, token-free `bulk-private://` media
   locator. Immediately before an adapter activity, the backend resolves the
   exact tenant + PublishingJob + asset + tuple. Provider-pull tuples receive a
   fresh matrix-bounded capability URL. Direct-upload tuples receive an
   internal job-scoped capability that adapter stream helpers consume; it is
   never handed to the provider. Hydrated capabilities are transient and are
   replaced with the opaque locator before pending state crosses a Temporal
   boundary. Tokens, query strings, and storage keys are redacted from logs.
7. `PublishingAttempt` is an append-only, tenant-qualified ledger around V109
   mutation, reconciliation, and confirmation activities. Attempt start is
   durable before the mutation; accepted/provider-ID, classified failure, and
   reconciliation evidence are durable afterwards. Stable workflow/activity
   idempotency keys make replay update the same attempt rather than allocate a
   second mutation attempt.
8. An error after a mutation may have reached the provider and is therefore
   ambiguous. V109 must call the adapter's read-only reconciliation contract
   before any retry. `confirmed` completes without reposting; `absent` permits
   the existing bounded retry policy; `inconclusive` (including unsupported
   readback) marks the PublishingJob and campaign job `NEEDS_REVIEW`, records
   `provider_timeout_ambiguous`/`needs_review`, and never blindly retries. A
   tuple cannot be certified in Stage 8 unless a real canary proves its absence
   or accepted-post readback contract.
9. Existing Temporal executions remain replay-safe through a V109 patch marker;
   historical workflow versions are not edited into campaign publishers.
   Campaign, tuple, and global dispatch kill switches are permanent. A disabled
   gate fails classified and leaves the reservation/job visible.
10. Replanning creates a new intent revision and new future unpinned job
    revisions. Published jobs, dispatched jobs with an ambiguous outcome, and
    manually pinned slots are immutable. Pause prevents new claims but does not
    erase jobs. Cancellation releases only future unpinned reservations,
    cancels unstarted Posts through the existing calendar writer, and records a
    visible issue for anything that cannot be safely cancelled.

### Consequences

- Campaign scale is represented in PostgreSQL and can be reconstructed without
  inspecting Temporal or Redis.
- A large campaign becomes many small idempotent transactions and bounded
  claims; one poisoned item cannot roll back the batch.
- Provider-specific reconciliation is now part of tuple certification rather
  than an optimistic claim inferred from mocks.
- The materializer deliberately creates ordinary Posts and PublishingJobs, so
  all existing receipts, retries, verification, usage, and account-queue rules
  continue to apply.

### Rejected alternatives

- **A campaign-specific publisher:** rejected because it would bypass V109 and
  duplicate reliability behavior.
- **Pre-create every Post during planning:** rejected because a 100,000-item
  campaign would create unbounded workflows and make replanning unsafe.
- **Put expanded jobs only in Redis/Temporal:** rejected because queue history
  is not the campaign source of truth.
- **Blindly retry provider timeouts:** rejected because an accepted request can
  produce a duplicate post.
- **Persist short-lived provider URLs in Post or workflow state:** rejected
  because tokens would outlive their need and leak through history/logging.
- **Move published or pinned slots during cadence edits:** rejected because the
  customer-visible calendar and provider truth must remain stable.

## ADR-032 - The 100,000-item and tenant-isolation gates are mandatory database workloads

Status: accepted  
Date: 2026-08-13  
Applies to Bulk Scheduler Stage 7, reservation batching, scale qualification,
tenant isolation, benchmark artifacts, and CI release gates

### Context

Unit mocks prove contracts but cannot expose PostgreSQL lock order, query fanout,
tenant-key mistakes, cursor gaps, or the memory/transaction shape of a 100,000
job campaign. The Stage 6 reservation loop was bounded in memory but still used
one reservation and one link transaction per job. That is linear in count yet
operationally too expensive at the required gate. A benchmark that merely seeds
finished rows would not exercise planning or reservations, and a suite that
skips when infrastructure is absent would turn the production requirement into
an optional claim.

### Decision

1. Add a bounded generic reservation-ledger batch operation, limited to 500
   committed `BULK_CAMPAIGN_SLOT` intents from one tenant. It takes the same
   tenant cutover lock, validates all connections, acquires slot advisory locks
   in a stable order, detects exact idempotent replays and changed-request
   reuse, expires abandoned holds, writes conflict rows and audits, and returns
   one result per input. It is an optimization of the existing ledger, not a
   second calendar writer.
2. Campaign reservation consumes deterministic schedule slots in keyset pages.
   A no-conflict page is created and linked in bounded database transactions.
   `keep_conflict` remains visible. `stop` retains the sequential boundary so
   nothing after the first conflict reserves. A race conflict under
   `next_available` is resolved after the page against subsequent free slots;
   every attempted conflict remains durable.
3. Job/reservation linking is one tenant-qualified `UPDATE ... FROM` per batch
   and verifies each authoritative committed reservation owns that exact job.
   A partial link count is an invariant failure; no unledgered job is treated as
   reserved.
4. `test/integration/bulk.scheduler.tenant-isolation.int.spec.ts` is a required,
   non-skipped PostgreSQL suite. It attempts cross-tenant reads, FKs, pins,
   retries, issues, cursors, claims, audit/event reads, and private-media links.
   Unknown and foreign IDs must be indistinguishable.
5. The 100,000-job gate is a dedicated non-skipped command. It exercises pure
   expansion, chunked database planning, authoritative reservations, complete
   keyset pagination, bounded claim/enqueue behavior, retry transitions,
   pause/resume, chunked cancellation, state aggregation, and tenant-isolated
   events. It records timings, row counts, query/page/batch sizes, peak process
   RSS/heap, database identity, and pass/fail assertions in a machine-readable
   JSON artifact.
6. The load command refuses any database name that does not match the explicit
   test-database safety policy, creates unique fixture tenants, performs no
   provider mutation, and cleans only its exact tenant rows. CI has no
   conditional skip. Missing PostgreSQL or a failed/missing benchmark artifact
   fails the release gate.
7. Hard bounds remain production constants: 100,000 expanded jobs per campaign,
   500 rows per plan/reservation/cancellation transaction, 100 API rows per
   cursor page, and configured bounded claim sizes. Measurements may justify
   smaller defaults, never unbounded fanout.

### Consequences

- The release claim is backed by an executed workload rather than extrapolated
  mocks.
- Batching reduces transaction/query overhead while retaining the reservation
  ledger's lock and idempotency semantics.
- CI needs PostgreSQL and has a deliberately longer scale gate; this cost is
  accepted because scale and isolation are product behavior.

### Rejected alternatives

- **Conditionally skip when PostgreSQL is unavailable:** rejected because a
  green build would not prove the required gate.
- **Insert 100,000 already-finished rows:** rejected because it bypasses the
  planner, reservation, claims, retries, and lifecycle paths under test.
- **Reserve in one giant transaction:** rejected because lock duration,
  rollback cost, memory, and blast radius would be unbounded.
- **Parallelize every account/job without a cap:** rejected because database
  pool and provider-queue pressure would become workload-sized.
- **Replace the database ledger with queue state for speed:** rejected because
  queues transport work and cannot become campaign truth.

## ADR-033 - Tuple certification requires an explicit, designated-account real-provider canary

Status: accepted  
Date: 2026-08-13  
Applies to Bulk Scheduler Stage 8, provider certification, evidence, default
eligibility, test destinations, launch gates, and permanent rollback controls

### Context

Stages 1 through 7 prove internal contracts, private media authorization,
authoritative reservations, V109-only execution, ambiguity handling, tenant
isolation, and a 100,000-job workload. Provider mocks and test-provider
readback cannot prove that a real platform accepts the exact account type,
post type, validation profile, private transport/fetch behavior, confirmation
method, or ambiguity boundary represented by one matrix tuple. Automatically
using an available customer connection would violate scope and could publish
real content. Updating the matrix from a successful HTTP response alone would
also overclaim: certification needs confirmed-live provider readback and a
durable evidence bundle for the exact code revision.

### Decision

1. The only Stage 8 candidate is an exact capability-matrix row whose adapter,
   private transport, provider confirmation, and ambiguity recovery flags are
   already implemented. Initially this is
   `instagram.professional.reel.video`; every other tuple remains disabled.
2. A checked-in CLI drives the normal authenticated Bulk Scheduler API:
   capability snapshot, native resumable upload, validation/normalization,
   campaign creation, deterministic plan/reservation, short-horizon
   materialization, V109 dispatch, receipts, provider confirmation, and
   campaign/job/issue readback. It never calls a provider adapter directly and
   never creates a second publishing path.
3. Execution requires all of the following explicit inputs: API base URL,
   canary API credential, organization ID, exact tuple ID, exact integration
   ID, a local non-sensitive MP4 fixture, expected provider destination label,
   evidence output path, and a confirmation phrase derived from tuple plus
   integration. The integration must also appear in the server-side canary
   integration allowlist and the tuple in the server-side canary tuple
   allowlist. Missing or mismatched input aborts before upload or campaign
   creation.
4. The harness first performs read-only preflight and requires the server to
   report canary mode, exact matrix eligibility for that integration, the
   expected provider, and the expected destination label. It rejects disabled,
   deleted, customer/unmarked, wrong-tenant, wrong-provider, or unallowlisted
   destinations. Operators must designate a provider-owned test account; a
   customer account is never acceptable.
5. The canary creates exactly one asset, one destination, and one job with a
   unique run marker in campaign name and caption. It checks expansion `1 × 1 =
1`, zero hidden overflow, one authoritative reservation, and one
   materialized V109 job. It polls bounded API reads until `confirmed_live` or
   a classified terminal outcome. It never converts `NEEDS_REVIEW` into a
   retry.
6. Certification succeeds only when provider readback yields
   `confirmed_live`, a provider post ID/URL, the publishing-attempt history
   contains no unresolved ambiguity, every receipt/failure is classified, and
   the provider-side canary can be identified by the unique marker. HTTP 2xx or
   `sent` alone is failure.
7. The harness writes a redacted, machine-readable evidence artifact containing
   matrix hash, git revision, run ID, destination IDs/labels (but no tokens or
   capability URLs), campaign/job/Post/publishing IDs, lifecycle timings,
   receipt stages, confirmation method, provider identifiers, and final
   verdict. It rejects suspicious URL/token fields before writing.
8. Certification evidence never edits the capability matrix automatically.
   After independent review of a passing artifact, a normal reviewed change may
   set that exact row to `certified` with its evidence path. A separate rollout
   decision may set `defaultEligible=true`. Passing never removes the global or
   per-tuple kill switches.
9. If credentials, a designated account, a reachable production-like stack,
   or provider approval are absent, the code and dry-run/preflight tests still
   complete, the tuple remains `not_run` and `defaultEligible=false`, and Stage
   8 is externally blocked/NO-GO. Plans, mocks, or skipped execution cannot
   substitute for the real canary.

### Consequences

- No real post can be emitted accidentally by a test run or by merely having a
  provider token in the environment.
- Canary evidence is reproducible and tied to the exact tuple, destination,
  matrix, and code revision, while secrets remain out of logs/artifacts.
- Launch may remain NO-GO after all internal gates pass; that is the correct
  outcome until an external provider canary confirms reality.

### Rejected alternatives

- **Certify from provider mocks:** rejected because mocks prove internal
  behavior, not provider acceptance or readback.
- **Use any connected account found in the database:** rejected because it may
  be a customer account and is not explicit authorization.
- **Call the Instagram adapter directly:** rejected because it bypasses V109,
  campaign gates, receipts, retries, and verification.
- **Treat `200`, container creation, or `sent` as success:** rejected because
  the product promise is confirmed-live delivery.
- **Automatically enable the tuple after a pass:** rejected because evidence
  review and customer rollout are separate controlled changes.

## ADR-034 - Stage 8 runs in a disposable, tenant-isolated production-image canary stack

Status: accepted  
Date: 2026-08-13  
Applies to Bulk Scheduler Stage 8 infrastructure, secret handling, private
media storage, public ingress, provider-account provisioning, and rollback

### Context

The development stack contains unrelated test-provider tenants, shared local
services, and store-owned social identities. None of those can safely prove a
real-provider tuple. A controlled provider canary also needs a public HTTPS
media origin, but making the workstation database, Redis, object store, or
Temporal admin surfaces public would increase blast radius and undermine the
tenant-isolation proof. The environment must be reproducible from the exact
production image while remaining unable to select a customer destination by
accident.

### Decision

1. Stage 8 uses a dedicated Compose project with its own PostgreSQL database,
   Redis instance, Temporal persistence/namespace, S3-compatible object store,
   application volumes, and network. It never connects to the development or
   customer data planes.
2. The backend and orchestrator run the same immutable image and migrations as
   production. The canary does not introduce a special publisher, queue, or
   database write path. The Dockerfile retains `all` as its production build
   default and exposes a `server` build scope for this API/worker-only canary;
   that scope compiles the production backend and orchestrator targets but not
   the unused frontend. All canary services reuse that one built image rather
   than launching duplicate BuildKit targets. Workspace manifests and the
   lockfile are copied before source, and pnpm uses a locked BuildKit store
   cache, so a source-only change cannot force a network-scale reinstall.
3. Public and Bulk Scheduler private media use different buckets. Both remain
   private during the canary; provider access to Bulk media is only through the
   existing job-scoped capability route. The S3-compatible canary store proves
   the same `PrivateS3MediaStorage` contract used with managed S3/R2, including
   range reads and repeat fetches, without borrowing another product's bucket
   or credentials.
4. Only a small HTTP gateway is reachable from the tunnel. PostgreSQL, Redis,
   Temporal, object storage, backend, and orchestrator have no public host
   bindings. A short-lived Cloudflare Quick Tunnel supplies HTTPS for the
   bounded canary window; its generated origin is injected as
   `PROVIDER_MEDIA_BASE_URL` before execution and checked by authenticated
   preflight.
5. A checked-in operator script generates high-entropy secrets into a
   gitignored run directory, starts dependencies, creates isolated buckets,
   applies migrations, creates the Temporal namespace, starts application
   services, discovers the tunnel URL, restarts the application with the exact
   public origin, and performs bounded health/readiness checks. It emits a
   redacted manifest and exact command results. It never prints or writes
   provider tokens into evidence.
6. Provisioning is two-phase. Repository-owned automation may create the
   canary tenant, user/API credential, calendar authority state, media fixture,
   and empty campaign prerequisites. It may import a provider connection only
   when the operator supplies an exact Publishly-owned test-account token,
   expected destination ID/label, and attestation. It must validate those
   values against the provider before storing them. It refuses existing
   customer/store identities and never infers a destination from whatever
   credentials happen to be present.
7. Missing provider credentials or a designated test identity never downgrades
   the test: infrastructure and dry-run gates may pass, but the tuple remains
   `not_run`, `defaultEligible=false`, and NO-GO until the real confirmed-live
   artifact passes. The stack therefore removes internal infrastructure
   blockers without fabricating external certification.
8. Rollback is permanent and layered: close the tunnel, set the global or
   per-tuple kill switch, disable materialization, retain ledgers/evidence for
   review, revoke the provider connection and media grants, and stop the
   isolated Compose project. Destructive volume removal is a separate explicit
   operator action after evidence retention.
9. Every canary run derives a bounded Compose project name from its immutable
   run ID and records that name in its manifest. A stopped or failed run can
   therefore never lend PostgreSQL, Redis, Temporal, MinIO, network, or
   container state to a later run. Failure handling brings that exact project
   down to prevent restart-policy resurrection while retaining its named
   volumes and host-side evidence for review.
10. Stack startup fails closed unless the repository volume has at least 12 GiB
    free, and the single server-image build has a 25-minute process timeout.
    Timeout is a classified `canary_command_timeout`, its unedited command
    result is appended to the run evidence, and the exact run project is
    stopped. These bounds prevent a stalled dependency/build step from
    exhausting the host or leaving an apparently active canary.
11. The canary selects the Dockerfile's `server-runtime` target. That target
    contains the same production-compiled backend/orchestrator output but only
    production dependencies, migrations, runtime data, and operator scripts.
    A clean `server-deps` stage installs production dependencies directly from
    the same pinned manifests/store as the build stage; it never copies and
    destructively prunes the multi-gigabyte hoisted build tree, because that
    operation is pathologically slow on overlay-backed Windows Docker storage.
    Prisma is a production dependency because migrations are a production
    startup responsibility. Video tooling comes from `/ffmpeg` and `/ffprobe`
    in `mwader/static-ffmpeg:8.1.1` pinned to multi-arch digest
    `sha256:735f84b905e00d5c618b667f0b053f83b1096f5fc404c607e6134bf2275a0e0a`;
    no package install script may fetch executable media binaries outside the
    lockfile. OpenSSL 3's binary, configuration, and shared libraries come from
    `node:22.12.0-bookworm` pinned to digest
    `sha256:0e910f435308c36ea60b4cfd7b80208044d77a074d16b768a81901ce938a62dc`,
    so Prisma generation and runtime detect the same ABI without a mutable apt
    transaction. Startup executes ffmpeg/ffprobe and records their version
    lines. Node's built-in fetch performs application health checks, and
    Compose `init: true` supplies PID-1 signal/reaping behavior. The generic
    all-services runtime remains available for existing frontend deployments.
12. A bounded external command is terminated as a process tree, not merely as
    its Docker CLI parent. On Windows the harness calls `taskkill /T /F` while
    the parent PID still exists; on POSIX it signals the detached process
    group. Captured stdout/stderr and termination details remain in evidence.
    This prevents timed-out Compose/buildx descendants from continuing after a
    run has been marked failed.
13. Temporal 1.28 readiness uses the supported Temporal CLI against the
    Compose service address (`temporal operator cluster health --address
temporal:7233`). The server does not listen on container loopback, so a
    `localhost:7233` probe is a false negative even after the workflow service
    reports `SERVING`. Backend/orchestrator remain dependency-gated on this
    real gRPC health result; no sleep or blind port-open check substitutes for
    it.
14. The server build stage copies only root TypeScript configuration,
    backend/orchestrator sources, shared libraries, and the capability data
    required by those services before compilation. Runtime operator scripts
    are copied only after compilation. Documentation, Compose, evidence, and
    script-only edits therefore cannot invalidate the expensive compiler
    layer. `.runtime/` is excluded from every Docker build context so generated
    canary secrets can never enter an image layer; backend/orchestrator dist
    directories are excluded as untrusted host build output. The generic
    all-services build remains a separate production-default stage.
15. Initial Compose readiness and post-tunnel application recreation each use
    a 12-minute tree-aware command bound and capture complete stdout/stderr in
    the run evidence. Failure cleanup has its own five-minute bound. A service
    health dependency can therefore neither hang the operator terminal nor
    outlive a classified failed run.
16. Host-generated TypeScript incremental-state files (`*.tsbuildinfo`) are
    excluded from every image build context. They are machine/filesystem
    specific, are not production inputs, and must never seed a Linux compiler
    run from a Windows checkout. The canary still performs a clean production
    backend/orchestrator compile in the immutable image; type checking remains
    a separate mandatory release gate. A build-context contract test protects
    the exclusion because stale incremental state previously consumed the
    entire bounded build window without producing a valid image.
17. The reusable `server-runtime` image transpiles backend, orchestrator, and
    their two shared server libraries with the repository-pinned SWC compiler,
    preserving each file's repository-relative path. SWC emits the same
    CommonJS, legacy-decorator, and decorator-metadata semantics required by
    Nest, while an independent exact-Node TypeScript gate remains mandatory in
    CI and release evidence. Tests, declarations, and host build state are not
    packaged. The transpiler writes a deterministic input/output hash manifest
    and uses a bounded worker pool; the runtime starts the emitted source-shaped
    tree directly. This separates type validation from image packaging and
    prevents TypeScript analysis speed from making deployability depend on a
    large Docker overlay filesystem, without introducing a second application
    or publishing execution path. The build explicitly disables ambient
    `.swcrc` discovery because the repository contains a legacy developer-local
    absolute `baseUrl`; only the server builder's checked-in options may affect
    release output.
18. The server dependency tree is a generated workspace manifest derived from
    the same backend/orchestrator runtime import closure plus the explicit
    migration and provisioning entry points. Direct external imports must be
    declared at the workspace root, and the generated manifest is verified by
    the architecture gate. Server build and production-dependency stages use
    filtered pnpm installs against that manifest, separate concurrent-safe
    BuildKit caches, and explicit Prisma generation. The generated package is
    installed as a standalone project with `--ignore-workspace` and its own
    checked-in frozen lockfile; it inherits the root security overrides,
    approved native builds, and patch set (with paths rebased to the package).
    Direct versions are pinned to the exact resolutions already recorded for
    the root importer, not re-resolved from semver ranges. The production-only
    install is the base of the build stage; adding the two compiler dependencies
    is an incremental child layer, so packages are downloaded/linked once and
    the final image still copies the clean production tree.
    It does not ask pnpm's hoisted workspace installer to process the frontend,
    extension, or unrelated root dependency graph. This replaces two serialized
    3,000+ package installs and a multi-gigabyte runtime export with the smallest
    reproducible server set while retaining a reviewed lock and normal V109
    application code.
19. A timed-out Compose client is not assumed to have cancelled its BuildKit
    solve. The harness enumerates current build records, inspects only running
    `server-runtime` records whose Docker Compose project label exactly equals
    the run's unique project, and removes those exact refs. It then records the
    post-cancellation state in command evidence. No build from another project
    may be selected by time, target name, or recency alone. This closes the
    daemon-side orphan path that continued consuming disk after a Windows CLI
    process tree had already terminated. If Docker's history API is itself
    unavailable, that secondary failure is appended to evidence but may not
    replace the original build timeout classification or duration.
20. Image dependency fetches retain the frozen standalone lockfile and pnpm
    store-integrity checks, but use an explicit bounded request policy:
    `networkConcurrency=8`, five retries, one-to-ten-second retry backoff, and
    a 120-second per-request timeout. Installs prefer the locked local
    BuildKit store and fetch only missing content. This replaces pnpm's
    machine-dependent concurrency with a reproducible value that does not
    overload a constrained registry connection; it does not relax the
    25-minute release-build bound or permit an unfrozen/offline-substituted
    dependency graph.
21. Daemon-side timeout cleanup queries BuildKit with both repository locality
    and `status=running` filters before applying the exact target, Dockerfile,
    and Compose-project-label checks in item 19. Enumerating completed history
    is neither needed for cancellation nor safely bounded on Docker Desktop
    installations with a large history database. A filtered empty result is a
    valid indication that the CLI/process-tree termination already ended the
    solve; an unavailable filtered query remains a separately recorded cleanup
    failure.
22. A canary run persists one explicit Buildx builder in its immutable manifest.
    The builder must be the implicit builder observed through the run's pinned
    Docker context and must pass a bounded `buildx inspect` check with a running
    node before any image build starts. History and cancellation commands also
    name that exact builder. An operator may select it with
    `PUBLISHLY_CANARY_BUILDER`; Docker Desktop defaults to `desktop-linux`,
    while other hosts default to `default`. The harness never inherits a
    globally selected custom builder, because a stopped global builder can
    otherwise make the build and its cleanup target different daemons.

### Consequences

- A canary failure cannot corrupt local development data or expose private
  infrastructure.
- The real provider fetches through the production private-media route and the
  production S3 implementation, while the stack stays inexpensive and easy to
  reproduce.
- A dynamic tunnel requires a controlled restart before preflight, but avoids
  binding a permanent public hostname to an unapproved tuple.
- Failed runs remain forensically inspectable without contaminating the next
  run, and predictable disk/build bounds convert workstation exhaustion into a
  visible preflight or timeout failure.
- Social-provider ownership and permission approval remain real external
  facts; automation validates them but cannot honestly replace them with a
  mock, customer account, or guessed credential.

### Rejected alternatives

- **Reuse the running development stack:** rejected because its tenants,
  queues, integrations, and service state are not isolated.
- **Reuse Atlas/store R2 buckets or social pages:** rejected because those are
  separate product/customer assets and violate the designated-account rule.
- **Expose MinIO, PostgreSQL, Redis, or Temporal through the tunnel:** rejected
  because providers only need the capability-gated HTTP media route.
- **Certify against a fake Instagram row or test-provider integration:**
  rejected because internal compatibility is not provider acceptance.
- **Delete the canary data automatically after a failure:** rejected because
  ambiguous mutations and classified failure evidence must survive review.

## ADR-035 - Stage 8 runtime startup is bounded, observable, and reuses one workflow bundle

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The orchestrator gives every provider its own Temporal task queue, but every
queue executes the same deterministic workflow module. Passing the same
`workflowsPath` to each worker made the Temporal SDK invoke webpack once per
queue during process startup. On the Windows bridge this consumed several
minutes, approached a gigabyte of resident memory, and could terminate before
the health listener bound. The prior watchdog also discarded child stdout and
stderr, making a cold start indistinguishable from a silent crash. Finally, an
empty host Redis override could select a non-durable in-process fallback even
though the reliability runtime requires shared queue state.

### Decision

1. Worker-mode Temporal configuration uses `registerAsync` to call the exact
   installed `@temporalio/worker` bundler once. The resulting immutable bundle
   object is supplied to every worker definition. Task queues, provider
   concurrency limits, activities, retry behavior, and V109 publishing remain
   unchanged. A bundle error fails the orchestrator startup; it may never leave
   an apparently healthy partial worker topology.
2. Non-worker clients keep the synchronous Temporal registration path and do
   not load or bundle workflow code.
3. The interim Windows bridge pins its shared Redis endpoint to the local
   durable Redis service, requires the port before launching backend or
   orchestrator, and records a visible dependency failure instead of falling
   back to process-local state.
4. Every watchdog-launched backend and orchestrator process redirects stdout
   and stderr to stable files under `%LOCALAPPDATA%\Publishly`. The watchdog
   log records process IDs and health probes; startup failures therefore have
   durable operator evidence.
5. The disposable Node compile cache lives under `%LOCALAPPDATA%\Publishly`
   on the system volume. It may not share the Docker Desktop VHD volume: image,
   database, and queue I/O must not starve application module loading. The
   cache is never a source of truth and can be replaced without touching
   builds, ledgers, or provider state.

### Consequences

- Workflow code is compiled once per orchestrator process instead of once per
  provider queue, sharply reducing cold-start time and peak memory without
  merging queues or weakening provider limits.
- The bundle is produced by the same SDK installation that consumes it, so no
  cross-version bundle compatibility assumption is introduced.
- The temporary workstation bridge now depends explicitly on durable Redis;
  loss of that dependency is a visible no-start/degraded condition rather than
  silent in-memory divergence.

### Rejected alternatives

- **Disable most provider queues:** rejected because it would silently reduce
  existing publishing coverage and would make runtime health overstate actual
  service readiness.
- **Compile one bundle per queue as before:** rejected because identical work
  caused the measured cold-start/resource failure.
- **Treat the in-process Redis mock as production-ready:** rejected because it
  cannot coordinate retries, queues, idempotency, or state across processes.

## ADR-036 - Stage 8 binds the Buildx builder and Docker context as one execution target

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

Buildx builders that use Docker's `docker` driver are scoped to a Docker
context. Recording only `BUILDX_BUILDER` was insufficient on Docker Desktop:
Compose could resolve the selected builder from a different implicit context
and fail before the first build step, while later history or cleanup commands
could address a different daemon. That makes the run neither reproducible nor
safe to clean up.

### Decision

1. Every canary manifest records both `buildxBuilder` and `dockerContext`.
   `PUBLISHLY_CANARY_DOCKER_CONTEXT` may select the context explicitly;
   Windows Docker Desktop defaults to `desktop-linux`, and other hosts default
   to `default`. Both values are validated as Docker identifiers.
2. Every Docker command in the run uses `docker --context <dockerContext>`:
   daemon preflight, Buildx inspection/history/cancellation, Compose config,
   build, startup, status, and teardown. The child-process environment also
   pins `DOCKER_CONTEXT`, because the Compose plugin can invoke Buildx as a
   subprocess that cannot inherit a parent CLI flag.
3. Startup must prove that the recorded builder has a running node when
   selected implicitly through the recorded context. A mismatch is a
   classified preflight failure; the harness does not fall back to another
   context or builder. Compose is not given `BUILDX_BUILDER`: Docker-driver
   builders are created automatically from contexts, and current Compose
   rejects forcing that context-generated builder by name. Exact context plus
   implicit-builder equality provides the same binding without that invalid
   invocation; history and cancellation still name the recorded builder. The
   bounded builder inspection allows 90 seconds because the measured Docker
   Desktop control plane can exceed 30 seconds under concurrent host load; the
   image build's independent 25-minute bound is unchanged.
4. Worker enumeration may return a transient internal `DeadlineExceeded` even
   while the same builder is healthy on the next probe. Preflight therefore
   permits at most three bounded read-only inspections with short deterministic
   spacing. Any probe that selects a different builder fails immediately; no
   probe may weaken the exact-name/running-node requirement. Three unavailable
   results remain a classified no-start and never invoke Dockerfile execution.

### Consequences

- Image production and exact-ref cleanup address one auditable daemon even if
  an operator changes their global Docker context after `prepare`.
- A Docker context problem fails before application containers or provider
  traffic exist, and the recorded run remains reproducible.

### Rejected alternatives

- **Rely on the globally current Docker context:** rejected because it is
  mutable process-external state and can drift between prepare, start, and
  cleanup.
- **Drop the explicit builder and let Compose choose:** rejected because it
  reopens the orphaned-solve and wrong-daemon cleanup risk addressed by
  ADR-034.

## ADR-037 - Canary retries retain prior failures without contaminating current state

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The isolated stack intentionally permits retrying the same immutable run after
a classified infrastructure failure so that its BuildKit and data volumes can
be reused. The manifest previously spread all prior fields into the next
attempt. A later successful start could therefore still expose the prior
`failure` and `failureCleanup` as if they described the current ready state.
Removing those fields outright would instead violate the requirement that
every failed outcome remain durable.

### Decision

1. Every `start` increments a monotonic `attemptNumber`. Before retrying a
   failed start, the harness appends its number, timestamps, classified
   failure, and scoped cleanup result to immutable `attemptHistory`.
2. Attempt-local terminal and readiness fields are cleared when the next
   attempt begins. Current `failure` fields describe only the current attempt;
   the command JSONL and `attemptHistory` retain all earlier outcomes.
3. A successful retry may reuse only the same run's frozen revision, image tag,
   tenant identity, volumes, Docker context, and builder. Changing code or
   identity requires a newly prepared run.

### Consequences

- Operators can distinguish “failed once, then passed” from both a clean first
  pass and an unresolved current failure.
- Cache reuse does not erase evidence or weaken the immutable-revision gate.

### Rejected alternatives

- **Leave stale failure fields on a ready manifest:** rejected because it gives
  the current state two contradictory outcomes.
- **Overwrite the prior failure:** rejected because it destroys forensic and
  reliability evidence.

## ADR-038 - Stage 8 builds the server image through direct, identity-checked Buildx

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

Docker Compose 5.1.4 translates `compose build` into an internal Buildx Bake
frontend. On the restored Docker Desktop daemon that wrapper repeatedly failed
at Dockerfile line 1 with `frontend grpc server closed unexpectedly`, while a
direct Buildx invocation parsed the same pinned Dockerfile frontend and target
successfully. Compose remains valuable for rendering and running the isolated
service graph, but its build wrapper is not part of Publishly's runtime
contract. Inspection also proved that Docker Desktop history list results use
a qualified ref while history inspect/remove accept the terminal record ID.

### Decision

1. Build `server-runtime` exactly once with
   `docker buildx build --builder <recorded> --load`, the repository Dockerfile,
   the immutable run image tag, and plain captured progress. No frontend-only
   build argument is forwarded because that target does not descend from the
   frontend `build` stage or consume those arguments.
2. The build writes run ID, build revision, Compose project, and service labels
   into the image. Before any container starts, the harness inspects the loaded
   tag and requires those labels to match the immutable manifest.
3. Compose still validates the complete configuration and owns service
   lifecycle, dependency health, networks, and volumes. Both startup calls use
   `--no-build`; Compose may never silently invoke a second build path.
4. Timeout cleanup queries only running records on the recorded builder,
   normalizes each qualified list ref to its terminal Buildx record ID, then
   inspect/removes only records whose target, Dockerfile, and exact project
   label match the run. Evidence retains both qualified and normalized refs.
   The filtered history enumeration has a 90-second bound because the measured
   Docker Desktop history store required 52 seconds under host load; exact-ref
   inspect/remove operations retain their shorter bounds.

### Consequences

- The production image uses one explicit Docker/Buildx API instead of a
  version-sensitive nested Bake bridge, while the runtime topology remains the
  checked-in Compose definition.
- A loaded image with the right tag but wrong run identity cannot reach startup.
- Exact-solve cleanup now uses the identifier form accepted by the installed
  Buildx history API.

### Rejected alternatives

- **Restart Docker Desktop and retry the same Compose wrapper:** rejected
  because it would interrupt unrelated restored workloads without addressing
  the wrapper-specific failure that direct Buildx disproved.
- **Remove labels or match the newest build by time:** rejected because cleanup
  could then cancel another project or accept an unrelated image.

## ADR-039 - The production Dockerfile uses the Engine-bundled frontend

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

After the Compose wrapper was removed, repeated builds still failed before the
first project layer because the external \`docker/dockerfile:1.7\` gateway
frontend's gRPC server closed unexpectedly. The same complete Dockerfile,
passed without its syntax directive to the installed Docker Engine 29.5.3 /
BuildKit 0.30.0 bundled frontend, successfully parsed the \`server-runtime\`
target and all required \`RUN --mount\` and \`COPY --link\` instructions. The
failure was therefore the extra gateway process, not Dockerfile validity or
the server build graph.

### Decision

1. Remove the external \`# syntax=\` directive and use the Docker Engine-bundled
   Dockerfile frontend. The canary already records and preflights the exact
   Engine, BuildKit builder, context, Dockerfile digest, and immutable workspace
   revision.
2. Keep every base image and toolchain version pin, frozen lockfile, integrity
   check, target, image label, and build bound unchanged.
3. If a future required Dockerfile feature is unavailable on a release host,
   preflight fails there; the harness may not silently fall back to a mutable
   remote frontend.
4. Any remaining frontend-termination stderr is promoted from the generic
   command-exit code to `canary_buildkit_frontend_terminated` with an explicit
   human reason while retaining the underlying command evidence.
5. A Buildx exit that reports `context canceled` is classified separately as
   recoverable `canary_buildkit_context_canceled`; it cannot be mistaken for a
   Dockerfile, dependency, compiler, or application failure.

### Consequences

- Image builds no longer depend on a short-lived external frontend gRPC bridge
  that repeatedly terminated on the release host.
- Reproducibility now includes the recorded Docker Engine/BuildKit versions,
  while application and base-image inputs remain content/version pinned.

### Rejected alternatives

- **Keep retrying the external frontend:** rejected after repeatable failures
  and a successful bundled-frontend control using the same Dockerfile.
- **Restart Docker Desktop:** rejected because it would disrupt unrelated
  workloads and the bundled-frontend control proved the daemon can parse the
  build without a restart.

## ADR-040 - Standalone dependency linking is resumable but the runtime tree is immutable

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The frozen standalone runtime resolves 1,352 transitive packages. Measurements
showed that registry fetch was no longer the limiting step: 1,094 packages were
reused and only 17 downloaded, but linking the hoisted tree reached 1,109
packages after almost 25 minutes on Docker Desktop's overlay filesystem.
Because node_modules lived in the ordinary RUN layer, the bounded client
cancellation discarded all partial linking and the next exact retry restarted
at zero. The content-addressed pnpm store alone therefore could not make
bounded retries converge.

### Decision

1. Mount a dedicated, locked BuildKit cache at the standalone node_modules
   directory for both production and compiler installs. A killed install may
   resume and pnpm must revalidate it against the same frozen standalone
   lockfile before it is trusted.
2. After the production-only install and Prisma generation complete, create a
   deterministic tar archive outside the cache mount. That archive is the only
   dependency artifact committed by server-deps; cache contents are never
   copied or treated as an image layer directly.
3. The final Node 22.12 image extracts the production archive into its normal
   /app/node_modules tree, removes the archive, and then runs as the
   unprivileged node user. The compiler stage mounts the resumable tree only
   while installing/compiling and is not copied into the runtime.
4. Store and module caches use explicit Publishly IDs and sharing=locked.
   Frozen-lock verification, package integrity, ignored lifecycle scripts,
   Prisma generation, security overrides, and the 25-minute per-build bound
   remain unchanged.

### Consequences

- Bounded retries converge instead of relinking thousands of packages from
  zero, while a final image still contains a complete immutable dependency
  tree independent of BuildKit cache availability.
- A partial or stale cache cannot pass: pnpm must finish successfully, Prisma
  must generate, the archive must complete, and image identity/runtime checks
  still run before startup.

### Rejected alternatives

- **Extend the image timeout until one monolithic link finishes:** rejected
  because it hides non-resumable work rather than making the build efficient.
- **Run production directly from a BuildKit cache mount:** rejected because
  caches are mutable build transport, not deployable source of truth.
- **Drop reachable dependencies solely to make the canary build faster:**
  rejected because it could create a runtime path that no longer matches the
  existing API and V109 publisher.

## ADR-041 - Canary build identity hashes the complete effective runtime input set

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The first revision guard hashed every tracked and untracked repository file.
During a bounded image attempt, an independent process legitimately edited five
VPS documentation, example-environment, and deployment-helper files that the
server-runtime target and isolated canary never read. The next attempt was
correctly rejected by that broad hash, but the revision had become sensitive to
unrelated workspace activity rather than to effective build/runtime inputs.
This prevented safe reuse of an otherwise unchanged immutable image graph.

### Decision

1. Define and contract-test an explicit effective-input set containing the
   Dockerfile and ignore file; root/workspace and copied package manifests and
   locks; patches; standalone runtime package; backend, orchestrator, helper,
   Nest library, Prisma, and data trees; copied build/provision scripts; the
   isolated Compose/Caddy configuration; and Stage 8 stack, environment, and
   provider-canary harnesses.
2. Hash file path plus bytes for every tracked or untracked, non-ignored file
   inside that set in deterministic order. A change to any effective input
   invalidates the prepared run before Docker is invoked.
3. Files that cannot enter or control this server/canary artifact—marketing
   UI, docs, VPS helpers, unrelated examples, tests, and runtime evidence—do
   not affect its build revision. Their edits remain preserved and may have
   their own release identities.
4. The input matcher is conservative: adding a file under an included source,
   data, patch, deployment, or selected script path immediately enters the
   digest. Dockerfile changes are always included and require review.

### Consequences

- Unrelated workspace edits no longer break a long immutable build or discard
  safe resumable cache progress.
- The recorded revision still changes for every byte that can affect the
  canary image, topology, preflight, or provider execution harness.

### Rejected alternatives

- **Disable the revision recheck:** rejected because changed runtime code could
  then build under a stale tag.
- **Continue hashing the entire monorepo:** rejected because it confuses
  unrelated release surfaces with the effective server artifact and was
  disproved by measured concurrent edits.

## ADR-042 - Stage 8 sends one immutable effective-input archive to BuildKit

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

Two direct Buildx attempts were canceled while Docker Desktop transferred a
small 1.8-2.75 MB directory context from Windows. The transfer took several
minutes because it walked many individual files, and Docker's own log records
the engine connection dropping at the same time. A separate orphaned Publishly
validation client was also holding the shared builder. Package and module
caches cannot help when a solve dies before its Dockerfile inputs arrive.

### Decision

1. At `prepare`, enumerate the same sorted effective-input set used by
   ADR-041, reject unsafe newline-bearing names, and create one private tar
   archive beneath the run's gitignored `.runtime` directory. Record its byte
   size and SHA-256 in the manifest.
2. At every `start`, first re-hash the live effective inputs, then re-hash and
   size the prepared archive. A changed workspace, missing archive, changed
   archive, or malformed input list fails with a stable class/code/reason
   before Docker is invoked.
3. Feed the verified archive to `docker buildx build ... -` through an inherited
   file descriptor. Do not buffer source files in Node memory and do not use
   Docker Desktop's per-file directory-context synchronization path.
4. The archive includes no repository-excluded file, runtime evidence, secret
   environment file, `.git` data, dependency tree, build output, or unrelated
   release surface. It remains local and restricted with the failed run so an
   exact retry can reuse the identical input; it is never uploaded as evidence.
5. Command evidence records only archive digest and byte count, never source
   bytes. Build labels, image identity checks, frozen locks, target selection,
   timeouts, exact-solve cleanup, and permanent kill switches remain unchanged.

### Consequences

- BuildKit receives one bounded sequential stream instead of thousands of
  Windows filesystem synchronization operations, eliminating the measured
  pre-Dockerfile bottleneck while strengthening retry identity.
- A retry cannot accidentally combine a prior manifest with current source or
  a tampered local archive.

### Rejected alternatives

- **Keep retrying the directory context:** rejected after two engine-level
  cancellations at the same transfer boundary.
- **Pipe a live `tar` process directly into Buildx:** rejected because source
  could change mid-stream and the retry would have no independently verifiable
  immutable context artifact.
- **Archive the whole repository:** rejected because it would reintroduce
  unrelated files, secret/runtime risk, and unnecessary transfer work.

## ADR-043 - Interim uptime requires semantic health and durable Redis

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

During the BuildKit engine interruption, PostgreSQL and the orchestrator kept
their Windows listeners open while Prisma reported `P1001` and
`GET /health/status` timed out. The five-minute watchdog checked only TCP
listeners and therefore returned success. Concurrent workspace drift had also
changed the bridge to `REDIS_DISABLED=true`, contradicting ADR-035 and allowing
API and worker processes to use independent in-memory queue state.

### Decision

1. Restore ADR-035's exact `publishly-redis` dependency. The watchdog inspects
   and starts only that named container on the explicit `desktop-linux` context,
   requires localhost port 6380, exports `REDIS_URL=redis://127.0.0.1:6380`, and
   explicitly disables the in-memory fallback. Missing or unavailable Redis is
   a classified no-start condition, never a silent downgrade.
2. Retain port probes for launch sequencing, but use bounded JSON health probes
   as the readiness truth: backend requires `status=ok`, database, and Redis;
   orchestrator requires `healthy=true`, Temporal, and the durable publishing
   heartbeat.
3. When a listener exists but two semantic probes fail, identify the owning
   Publishly Node process by its exact built entry point, terminate only that
   process, relaunch it through its existing owner, and verify semantic health.
   Every detection, recovery, and residual failure is written with stable
   class/code/reason evidence.
4. A watchdog pass exits nonzero when required local semantics remain unhealthy
   after bounded recovery. Public HTTP 200 alone may not override a local
   database, Redis, Temporal, or publishing-engine failure.
5. Docker image builds and the interim runtime remain operationally separate.
   The Redis dependency is exact and recoverable; the production VPS still uses
   the isolated checked-in Compose topology and does not inherit this bridge.

### Consequences

- An open but wedged socket can no longer masquerade as a healthy publishing
  engine, and queue/idempotency coordination cannot silently split by process.
- The temporary bridge has an explicit Docker-backed Redis dependency until
  VPS cutover; its loss is visible in task status and durable operator logs.

### Rejected alternatives

- **Keep TCP listeners as health truth:** rejected by the measured hung-port
  incident.
- **Keep `REDIS_DISABLED=true` for workstation convenience:** rejected because
  retries and state coordination are core reliability behavior.
- **Restart Docker Desktop or broad process groups from the watchdog:** rejected
  because unrelated workloads share the host; recovery must remain exact.

## ADR-044 - Semantic recovery owns the full exact-task restart handshake

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The first registered semantic-health pass detected an orchestrator that did not
answer two bounded probes. Windows accepted the exact Node process termination,
but the dedicated scheduled-task owner remained in `Running` state briefly.
The watchdog's immediate process lookup treated that termination race as a
stop failure and exited before it could request the replacement worker. TCP
truth had been correctly rejected, but recovery itself was not atomic from the
operator's perspective.

### Decision

1. An unhealthy-process recovery owns the complete exact owner handshake. It
   terminates only the verified built entry point, waits boundedly for that PID
   to disappear, stops the exact dedicated orchestrator task when applicable,
   waits for its owner state to settle, and only then returns to launch logic.
2. A PID that disappears during the bounded termination window is success, not
   a race failure. If it remains, one exact PID/tree force-termination is
   allowed and recorded; broad Node, PowerShell, Docker, or task termination is
   forbidden.
3. Backend, orchestrator, and frontend launch concurrently and share one
   six-minute semantic-readiness deadline. A slow first service cannot grant a
   broken later service a second full recovery window, and cold import time is
   not mislabeled after a short fixed attempt count.
4. The watchdog records detection, owner settlement, relaunch request, and final
   semantic proof as distinct class/code/reason events. The registered task must
   exit zero in steady state before this bridge is considered verified.

### Consequences

- A valid unhealthy detection now results in either a verified replacement or
  one durable final failure; it cannot strand the publishing worker between an
  accepted kill and a skipped relaunch.
- Recovery remains narrowly scoped and bounded while tolerating measured
  Windows process/task-state propagation latency.

### Rejected alternatives

- **Ignore an unresponsive semantic endpoint while its port is open:** rejected
  because the original incident proved that state can be wedged.
- **Let Task Scheduler eventually restart after a failed watchdog pass:**
  rejected because recovery outcome would be delayed and invisible.
- **Kill every Node or task process to clear the race:** rejected because the
  host runs unrelated workloads and the exact entry point is known.

## ADR-045 - Interim durable Redis moves out of Docker's canary failure domain

- **Status:** Accepted; supersedes ADR-043 decision 1 for the interim Windows
  bridge only
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

Docker Desktop exited again without a canary solve running. Its engine pipe
disappeared, the exact `publishly-redis` container stopped, backend health
correctly returned 503, and the public API became unavailable. The watchdog
could classify the dependency failure but could not recover an engine that
reported `Docker Desktop is unable to start`. Ubuntu 26.04 WSL is a separate,
healthy systemd environment and provides Valkey 9.0.3, a Redis-protocol server.
Keeping public queue state on the same daemon being stressed and restarted for
image certification couples two unrelated failure domains.

### Decision

1. The interim bridge uses a dedicated `publishly-valkey.service` in the Ubuntu
   WSL distro, installed from Ubuntu's signed `valkey-server` package. It listens
   on port 6380, requires a generated high-entropy password, enables append-only
   persistence in its own systemd state directory, restarts on failure, and runs
   as the unprivileged `valkey` user with systemd hardening.
2. The password exists only in root-readable WSL service environment and the
   restricted Windows host environment. Launchers read the complete authenticated
   `REDIS_URL`; they may not print it, hard-code it, or fall back to memory.
3. The watchdog starts/checks only the exact WSL distro and systemd unit through
   bounded commands, then requires localhost port 6380 and application-level
   authenticated Redis health. Docker Desktop is not consulted by the interim
   uptime path.
4. A checked-in idempotent installer owns package installation, secret creation,
   unit provisioning, host-environment update, daemon reload, enable/start, and
   end-to-end PING verification. Re-running it preserves the existing secret and
   data.
5. This decision does not change the release topology: the isolated Stage 8 and
   production VPS Compose stacks retain their checked-in Redis container,
   private network, volumes, health checks, and rollback controls.

### Consequences

- Public API queue/idempotency state remains durable when Docker/BuildKit is
  stopped, restarted, or unable to start, so canary image work cannot remove a
  live dependency.
- The temporary workstation now depends on WSL/systemd rather than Docker for
  Redis. The watchdog exposes WSL/package/unit failures with stable reasons.

### Rejected alternatives

- **Keep restarting Docker for one Redis container:** rejected after the engine
  itself repeatedly exited or refused startup and caused a measured public 503.
- **Return to `REDIS_DISABLED=true`:** rejected because split process-local
  queue state violates retry, idempotency, and reliability guarantees.
- **Run Valkey unauthenticated on the WSL adapter:** rejected because the adapter
  is broader than loopback even though Windows normally NATs it locally.
- **Replace production Compose Redis at the same time:** rejected because this
  decision isolates a temporary host bridge and must not broaden release scope.

## ADR-046 - A dedicated Windows task keeps the interim WSL transport resident

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The hardened Valkey systemd unit remained active inside Ubuntu, but Windows
localhost port 6380 disappeared after the last `wsl.exe` client exited. A new
WSL command immediately restored the relay and existing ioredis clients
reconnected. WSL's distro/localhost transport lifecycle is therefore distinct
from the Linux service lifecycle; checking only `systemctl is-active` can still
leave a healthy server unreachable from Publishly's Windows processes.

### Decision

1. Register a dedicated `Publishly Interim Valkey Keepalive` scheduled task.
   Its checked-in launcher starts one hidden `wsl.exe -d Ubuntu -- sleep
   infinity` client and waits for that exact process. Task Scheduler restarts
   the owner if it exits.
2. The keepalive owns no queue state, credential, port, or service configuration.
   `publishly-valkey.service` and its append-only state remain authoritative;
   the process only keeps the WSL VM and Windows localhost relay resident.
3. The uptime watchdog first starts/verifies the exact systemd unit, then starts
   the exact keepalive task when absent and requires Windows port 6380. A running
   Linux unit without its Windows transport is a classified degraded condition.
4. Registration/removal manages the watchdog, orchestrator, and Valkey owner as
   three exact tasks. Logs use stable files and neither launcher reads or emits
   the Valkey password.
5. This is temporary workstation infrastructure only. VPS/Stage 8 containers do
   not run WSL or inherit the keepalive.

### Consequences

- Valkey remains reachable throughout long Node imports and idle periods instead
  of depending on incidental operator WSL commands.
- WSL transport failure becomes independently restartable and observable without
  restarting Valkey, PostgreSQL, Temporal, Docker, or application processes.

### Rejected alternatives

- **Poll WSL every few minutes:** rejected because the relay can disappear
  between polls and break active queues.
- **Move the backend into WSL:** rejected because it would broaden the temporary
  runtime migration and duplicate current Windows process ownership.
- **Use a busy loop or repeated PING as keepalive:** rejected because one sleeping
  client is lower overhead and does not mutate queue state.

## ADR-048 - Interim clients use the authenticated private WSL address

- **Status:** Accepted; supersedes ADR-045/ADR-046 references to Windows
  localhost forwarding
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

Windows localhost forwarding for WSL disappeared while the Valkey systemd unit
remained active and reappeared only after a new WSL client command. Direct
connections to the distro's private NAT IPv4 address remained available and,
with the generated password, passed both unauthenticated-denial and authenticated
PING checks. The distro address can change when WSL restarts, so a static copy is
not sufficient by itself.

### Decision

1. The installer resolves Ubuntu's current private IPv4 address, verifies Valkey
   authentication at that address, and writes the restricted `REDIS_URL` with
   the password redacted from all output.
2. Every watchdog pass resolves the current address before application launch.
   If it changed, the watchdog atomically replaces only the `REDIS_URL` host-env
   line, records `valkey_address_refreshed`, and launches/restarts processes with
   the new value. Invalid or missing authenticated URLs fail closed.
3. The dedicated WSL keepalive remains required: it stabilizes the distro and
   therefore its private address between watchdog passes. It no longer relies on
   localhost forwarding as the data path.
4. Valkey remains bound inside WSL, password-protected, append-only, and
   unprivileged. The address is private host infrastructure, not a public or
   provider-facing endpoint.
5. Production and isolated canary Compose Redis services are unchanged.

### Consequences

- Windows Redis clients no longer depend on the unreliable localhost relay, and
  a WSL address change is repaired before process launch rather than becoming a
  silent reconnect loop.
- The restricted host environment is runtime state; the checked-in source never
  contains either the address credential or password.

### Rejected alternatives

- **Keep localhost forwarding and ping it more often:** rejected because the
  measured relay vanished independently of Linux service health.
- **Hard-code the current WSL IP:** rejected because WSL NAT addresses may change
  after restart.
- **Expose Valkey on a public/LAN address without authentication:** rejected by
  the reliability and tenant-isolation threat model.

## ADR-049 - Runtime native dependencies and Prisma engines are provisioned explicitly

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The immutable Stage 8 server image twice stalled after `Prisma schema loaded`.
The retained build evidence showed that `pnpm install` completed, but the
runtime dependency command used `--ignore-scripts`. That flag overrode the
package's build-script allowlist, so the pinned `@prisma/engines` Linux binaries
and bcrypt native setup were not provisioned during installation. `prisma
generate` then entered an implicit engine-resolution path with no step-local
deadline. A single Docker-level deadline eventually classified the run, but it
could not identify the dependency fault early enough.

### Decision

1. The standalone server dependency boundary declares the exact native-script
   packages in `pnpm.onlyBuiltDependencies`, including bcrypt and the pinned
   Prisma client/CLI/engine packages. General installation still uses
   `--ignore-scripts`; the Dockerfile invokes only the pinned Prisma engine
   postinstall and bcrypt rebuild explicitly. Arbitrary transitive scripts
   therefore remain impossible, rather than merely depending on pnpm policy.
2. Dependency installation is a separate, cacheable, bounded Docker step. It
   reuses the lock-verified pnpm content store and complete module cache across
   source-only builds. Empirical Windows BuildKit evidence showed that replacing
   the cache required copying directory entries for 1,352 packages and could
   not finish within eight minutes even when every package was already in the
   verified store; immutable package content is not discarded merely to force
   regeneration.
3. Pinned Prisma engine provisioning, bcrypt rebuilding, and Prisma client
   generation are distinct bounded steps after dependency verification. Each
   emits stable `class`, `code`, and `reason` fields on failure; none may rely
   only on the outer canary timeout. A clean runner may populate the same cache
   from the frozen lockfile before those steps, while warm builds do no repeated
   package-tree materialization.
4. The runtime continues to use the pinned Prisma 6.5.0 lockfile and the Linux
   OpenSSL 3 target in the immutable image. `--no-engine`, mutable latest
   downloads, host-generated Windows clients, and unverified copied binaries
   are forbidden.
5. When a bounded Docker step emits a stable class/code/reason line, the canary
   wrapper promotes that exact marker to the manifest's top-level failure. A
   generic `canary_command_failed` may not hide a more specific retained code.
6. Contract tests guard the allowlist, explicit native invocations, denial of
   general lifecycle scripts, cache identity, step-local bounds, and top-level
   marker promotion before the full isolated canary is retried.

### Consequences

- Engine/native setup is explicit, reproducible, and cached instead of being a
  hidden side effect of `prisma generate`.
- A registry, engine, or generation failure terminates with a durable reason in
  minutes and cannot consume the entire image-build budget without attribution.
- Changing the native dependency allowlist or cache layout is a reviewed
  release decision because it changes executable build inputs.

### Rejected alternatives

- **Increase only the 25-minute outer timeout:** rejected because it preserves
  the unbounded hidden engine path and delays diagnosis.
- **Generate on the Windows host and copy `.prisma/client`:** rejected because
  the host binary target is not the Linux runtime target and the archive would
  no longer be self-contained.
- **Use `prisma generate --no-engine`:** rejected because the deployed API uses
  direct PostgreSQL through Prisma and requires its query engine.
- **Allow every dependency lifecycle script:** rejected because transitive
  scripts are executable supply-chain inputs and must remain deny-by-default.

## ADR-050 - Authentication uses the portable bcryptjs implementation

- **Status:** Accepted
- **Date:** 2026-08-14
- **Stage:** 8 - controlled real-provider canary and production runtime proof

### Context

The pinned native `bcrypt@5.1.1` package did not contain its Linux N-API addon
after a frozen, script-disabled install. An explicit `pnpm rebuild bcrypt`
returned success but still produced no `bcrypt_lib.node`, and the mandatory
runtime hash probe correctly stopped the image. Publishly has one bcrypt import.
The maintained `bcryptjs@3.0.3` package is dependency-free, includes its own
TypeScript declarations, exposes the used `hashSync`/`compareSync` API, and is
documented as hash-format compatible with the native binding.

### Decision

1. Replace native `bcrypt` and `@types/bcrypt` with exact `bcryptjs@3.0.3` and
   update the single authentication import. Existing `$2a$`/`$2b$` password
   hashes remain valid; no password reset or bulk rehash is introduced.
2. Add a fixed native-bcrypt compatibility vector plus positive/negative
   round-trip tests through `AuthService`. Authentication cannot ship based only
   on TypeScript compilation.
3. Remove bcrypt from build-script allowlists and Docker native stages. Prisma
   engine provisioning remains the only explicit server-runtime lifecycle step.
4. Regenerate both frozen lockfiles and the generated server-runtime dependency
   boundary with pinned pnpm 10.6.1. A stale package/lock pair remains an
   architecture-test failure.

### Consequences

- Server images no longer depend on GitHub prebuilt-addon availability, a C++
  toolchain, libc/N-API matching, or a native file silently missing after an
  apparently successful rebuild.
- Password hashing is expected to be modestly slower than the native binding;
  this affects low-frequency authentication work, not publishing throughput,
  and removes an unreliable executable supply-chain step.

### Rejected alternatives

- **Skip the bcrypt runtime probe:** rejected because login would fail only
  after deployment.
- **Install compilers and build bcrypt from source:** rejected because it makes
  the image larger and preserves an unnecessary native dependency.
- **Upgrade to another native bcrypt release:** rejected because the application
  needs only the portable API and existing hash format, while native ABI/release
  artifacts remain a failure mode.
- **Force all users to reset passwords:** rejected because bcryptjs is format
  compatible and the fixed compatibility vector is tested.
