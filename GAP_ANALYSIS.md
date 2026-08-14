# Publishly reliability-layer gap analysis

Audit date: 2026-08-10  
Audit target: the current working tree, including pre-existing modified and untracked files  
Position to own: **the reliability layer for social posting at scale — nothing fails silently, flat price, unlimited accounts**

## Audit scope and method

The repository contains 1,055 tracked files across the NestJS backend, Temporal orchestrator, Next.js frontend, shared libraries, SDK/CLI/extension, tests, deployment assets, and documentation. All non-dependency files were inventoried. Runtime entry points, controllers, DTOs, services, repositories, Prisma schema/migrations, Temporal workflows/activities, provider contracts and provider implementations, billing/permissions, webhook delivery, MCP tools, relevant frontend routes/components, and the complete test inventory were inspected. Full-tree semantic scans covered creation/publish paths, errors and swallowed exceptions, retries/rate limits, token state, lifecycle state, grouping, platform restrictions, metering, status/health, webhooks, n8n/Make, and MCP.

`node_modules`, generated reports, uploaded media, and static image/font binaries are not application logic and were not treated as code. Translation catalogs and static assets were inventoried; relevant user-facing reliability strings were searched across every locale.

The worktree was already heavily modified before this audit. Those changes are treated as current product state and must be preserved. No implementation code was changed before this file was created.

## Status summary

| # | Requirement | Status | Bottom line |
|---|---|---|---|
| 1 | Failure taxonomy | **Partial** | A ledger and a few ad-hoc categories exist, but not the required three-class taxonomy, stable codes, guaranteed reasons, or failure webhooks. |
| 2 | Delivery receipts | **Partial** | Per-destination jobs are queryable, but the lifecycle is not the requested lifecycle and `PUBLISHED` does not mean independently confirmed live. |
| 3 | Retries and idempotency | **Partial** | Safe transient retry and an internal job key exist; exponential jitter, durable 429 queueing, and request idempotency do not. |
| 4 | Token health engine | **Partial** | Expiration and reconnect state are stored; proactive warnings, issue time, health events, staleness, and dead-account detection do not exist. |
| 5 | Fleet health dashboard | **Missing** | There is an account list and an operator page, but no tenant fleet-health product. |
| 6 | Fleet primitives | **Partial** | One customer/group relation and per-channel posting times exist; tags, bulk connect, account queues, and staggered group distribution do not. |
| 7 | Platform truth | **Partial** | Some TikTok/Instagram restrictions are known, but neither required preflight contract is exposed end to end. |
| 8 | Public status page | **Missing** | Infrastructure probes and private operator stats exist; there is no public platform success/uptime page. |
| 9 | Billing alignment | **Missing / contradictory** | Current tiers, prices, channel caps, and metering directly conflict with the requested model. |
| 10 | Distribution surfaces | **Partial** | Signed webhooks and an MCP server exist; the reliability event contract, official local n8n/Make packages, and receipt/health MCP tools do not. |

## 1. Failure taxonomy — partial

### Exists

- `PublishingJob.lastError` and `PublishingJob.failureCategory` provide a place to persist a failure, in `libraries/nestjs-libraries/src/database/prisma/schema.prisma` and migration `libraries/nestjs-libraries/src/database/prisma/migrations/20260809030000_publishing_jobs/migration.sql`.
- `ProviderTransient`, `RefreshToken`, and `BadBody` distinguish a few provider/activity conditions in `libraries/nestjs-libraries/src/integrations/social.abstract.ts`.
- The current workflow deliberately avoids replaying an ambiguous post mutation and records `outcome_unknown` in `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.6.ts`.
- Queue-start failures are persisted as `queue_unavailable` in `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`.
- Failure rows are visible to operators in `apps/backend/src/api/routes/admin.controller.ts` and `apps/frontend/src/components/admin/admin-operations.component.tsx`.

### Partial or incorrect

- `failureCategory` is a free-form nullable string. Current values include `authentication`, `rate_limit`, `provider_validation`, `provider_error`, `provider_transient`, `queue_unavailable`, and `outcome_unknown`; they are not the required top-level classes `recoverable`, `user_action_needed`, and `data_problem`.
- There is no distinct machine-readable failure-code field. `failureCategory` is being asked to serve both category and code, while `lastError` is free-form.
- `PostsService.changeState()` guesses a category from substrings in an error message (`token`, `429`, `invalid`, and so on) in `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`. This is not deterministic provider error classification.
- `BadBody` mixes permission/authentication failures, rate limiting, malformed content, media constraints, provider policy, and provider outages. Individual providers therefore cannot reliably determine whether the user, the data, or Publishly should act.
- A failed destination does not emit a customer webhook. Notifications cover only selected branches.

### Violations of “failed, no reason given must be impossible”

- `BadBody` and fetch/upload fallbacks still use `Unknown Error` in `libraries/nestjs-libraries/src/integrations/social.abstract.ts`.
- `handleActivityError()` returns empty messages for timeout, stop, and unknown branches in `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.6.ts`.
- Several failure transitions accept an optional/empty `error`; both `lastError` and `failureCategory` are nullable in the schema.
- Early exits such as missing post, disabled connection, refresh-needed connection, exhausted pending polling, comment failures, and downstream state-write failures do not all pass through one required classifier/event path.
- Silent catches exist in the active posting workflow and activities, including state/confirmation fallback, streak start, and the outer webhook delivery path in `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.6.ts` and `apps/orchestrator/src/activities/post.activity.ts`.
- Historical workflow versions `post.workflow.v1.0.1.ts` through `post.workflow.v1.0.5.ts` remain registered for already-running Temporal executions and contain legacy failure behavior. They cannot be edited in place, so compatibility observability must be added around them.

### Missing tests

- No table-driven taxonomy tests cover HTTP/provider codes, permission failures, invalid tokens, malformed captions/media, 429s, 5xx, timeouts, network ambiguity, serialization errors, DB state-write errors, notification errors, and webhook errors.
- `test/e2e/publishing-resilience.e2e.mjs` covers only safe transient retry and ambiguous outcome behavior.

## 2. Delivery receipts — partial

### Exists

- The data model uses one top-level `Post` per destination and one unique `PublishingJob` per post, so a multi-platform composition already has per-platform isolation: `Post`, `PublishingJob`, and their relation in `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.
- Current job states are `DRAFT`, `SCHEDULED`, `QUEUED`, `PROCESSING`, `PUBLISHED`, `PARTIAL_SUCCESS`, `RETRYING`, `FAILED`, and `CANCELLED`.
- Receipts/jobs can be queried through authenticated `GET /posts/:id/publishing-job`, `GET /posts/publishing-jobs`, and public `GET /public/v1/posts/:id/status` in `apps/backend/src/api/routes/posts.controller.ts` and `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts`.
- Provider post ID, permalink, attempts, next attempt, timestamps, and last error can be persisted in `PublishingJob`.
- Several complex providers implement pending-status polling through `checkPostStatus`/`finalizePost` in the provider contract, with the current orchestration in `post.workflow.v1.0.6.ts`.
- A signed `post.published` webhook is attempted after a successful workflow in `apps/orchestrator/src/activities/post.activity.ts`; delivery attempts are recorded by `libraries/nestjs-libraries/src/database/prisma/webhooks/*`.

### Missing or incorrect

- The required lifecycle `queued → uploading → sent → confirmed_live` is absent. `PROCESSING` conflates preparation, upload, and provider mutation; there is no `SENT` or `CONFIRMED_LIVE` state.
- `PUBLISHED` is set by `PostsService.updatePost()` immediately after a provider returns success. For most providers that is only an API acceptance/result, not an independent read proving that the post exists on-platform.
- `checkPostStatus` is a processing/finalization mechanism, not a universal live-verification capability. Providers that return immediate success never get a second read. Even some completed pending flows fall back to a profile URL or an upload inbox rather than a verified post URL.
- There is no append-only lifecycle event/history table. A mutable `PublishingJob` row loses the sequence and timing of prior transitions.
- Lifecycle transitions, retries, failures, token problems, and confirmation results are not fired as webhooks. Only a final best-effort `post.published` event exists.
- The webhook payload is the post record rather than a documented, versioned delivery-receipt envelope.
- The outer webhook catch is silent; consequently even the notification mechanism can itself fail without an observable terminal record.
- There is no group-level receipt endpoint that summarizes every destination while retaining each destination’s receipt.

### Missing tests

- No test asserts every lifecycle transition in order, immutable transition history, webhook-per-transition behavior, live verification success/failure, or one-destination-fails/other-destination-succeeds group behavior.
- No failure-injection tests cover a receipt DB write or receipt webhook failure.

## 3. Retries, rate-limit queueing, and idempotency — partial

### Exists

- `ProviderTransient` is explicitly restricted to failures known to occur before a provider mutation, and `post.workflow.v1.0.6.ts` retries that class without replaying ambiguous mutations.
- Current retry delays are 15, 60, 300, 900, and 1,800 seconds; `nextAttemptAt` is persisted.
- Temporal workflow IDs are based on post IDs, and `PublishingJob.postId` and `PublishingJob.idempotencyKey` are unique.
- Provider task queues and `maxConcurrentJob` provide platform-level concurrency control in `apps/orchestrator/src/app.module.ts`, `libraries/nestjs-libraries/src/temporal/*`, and provider classes.
- The shared fetch/upload helpers retry 429 and selected 5xx responses, and provider polling is read-only/retryable.
- The resilience canary proves one safe retry and no replay for an ambiguous side effect.

### Missing or incorrect

- Workflow retry configuration uses `backoffCoefficient: 1`, and provider fetch/upload retries sleep a fixed five seconds. The explicit retry schedule is stepped but has no jitter. The requested exponential backoff plus jitter is not implemented.
- 429 handling is an in-memory sleep inside an activity/helper, not transparent durable rate-limit queueing. `Retry-After`, reset timestamps, provider/account buckets, queue position, and a receipt transition are not persisted.
- `PublishingJob.idempotencyKey` is internally generated as `publish:<postId>`. It does not deduplicate repeated HTTP/MCP/CLI/autopost/bulk creation requests because a retry creates a new `Post` first.
- Neither dashboard `POST /posts` nor public `POST /public/v1/posts` reads/requires an `Idempotency-Key` header. The MCP schedule tool, bulk import, autopost, generated posts, and other `PostsService.createPost()` call sites do not share a request-idempotency ledger.
- There is no request hash/conflict rule (same key + different body must reject), replay response storage, expiry policy, or in-progress claim behavior.
- `startWorkflow()` silently swallows workflow-list/terminate errors before starting a replacement, which weakens deduplication observability.
- The “priority retries” entitlement required for Growth has no scheduling policy.

### Missing tests

- No API concurrency test posts the same idempotency key many times and proves one set of destination posts/provider effects.
- No tests cover key/body conflict, in-progress key, cached response, expiry, each creation surface, `Retry-After`, jitter bounds, or rate-limit queue recovery.

## 4. Token health engine — partial

### Exists

- `Integration` stores `tokenExpiration`, `refreshNeeded`, `inBetweenSteps`, `disabled`, created/updated timestamps, and encrypted token/refresh-token fields in `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.
- OAuth writes an expiration derived from `expiresIn` in `libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts`.
- `refreshTokenWorkflow` and `RefreshIntegrationService` attempt refresh and mark reconnect-needed failures in `apps/orchestrator/src/workflows/refresh.token.workflow.ts` and `libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts`.
- The existing connection list exposes `refreshNeeded`, `disabled`, and between-steps state and can drive a reconnect action in `apps/backend/src/api/routes/integrations.controller.ts` and `apps/frontend/src/components/launches/*`.

### Missing or incorrect

- Token issue time is not stored. Only the calculated expiration is available.
- Provider-specific expected lifetimes and invalidation rules (Meta/LinkedIn/TikTok approximately 60 days, X approximately 90 days or password change) are not modeled.
- The refresh workflow sleeps until expiration rather than producing warnings at configurable lead times.
- No `token.expiring`, `token.expired`, `connection.reconnect_required`, `connection.stale`, or dead-account webhook events exist.
- No dashboard “expires in N days” warning exists; the user is warned only after `refreshNeeded` is set.
- No success/error streak, last successful publish/check, last provider contact, consecutive error count, staleness threshold, or dead-account state is stored.
- `refreshProcess()` catches the provider refresh error and reduces it to `false`; the original classified reason is not durably retained on the connection.
- There is no scheduled fleet-wide evaluator, warning deduplication, acknowledgment state, or recovery event.

### Missing tests

- No clock-controlled tests cover warning windows, refresh success/failure, password-change-style invalidation, stale account thresholds, repeated errors, deduplicated notifications/webhooks, or recovery to healthy.

## 5. Fleet health dashboard — missing

### Foundations that exist

- The launch/account list displays connected channels and groups them by `Customer` in `apps/frontend/src/components/launches/launches.component.tsx`.
- The account cards expose disabled and reconnect-needed states.
- Super-admin operations show global publishing states and recent job/webhook failures in `apps/backend/src/api/routes/admin.controller.ts` and `apps/frontend/src/components/admin/admin-operations.component.tsx`.
- `AnalyticsSnapshot` stores provider-reported analytics, but it is audience analytics rather than delivery health.

### Missing

- No tenant route/page provides one green/yellow/red row per connection.
- There is no canonical health score/state or explanation model.
- There is no per-account posting success rate, confirmation rate, retry rate, failure breakdown, token horizon, queue age, or last-good-post measurement.
- There is no filtering by account group and tags (connection tags do not exist).
- There is no bulk reconnect selection/flow.
- Existing super-admin operations are not tenant fleet management and do not satisfy the target user’s 20–500+ account workflow.
- There are no fleet dashboard API endpoints or SWR hooks and no tests for health computation/filtering/bulk reconnect authorization.

## 6. Fleet primitives — partial

### Exists

- `Customer` can act as a single account group; `Integration.customerId`, `/integrations/:id/group`, `/integrations/customers`, drag/drop UI, and MCP `groupList`/filtered `integrationList` provide basic grouping.
- Each integration has a `postingTimes` value and find-slot behavior.
- Temporal uses provider-level task queues and provider concurrency caps.
- A composition can create per-destination posts joined by a content `Post.group`.

### Missing or incorrect

- An integration can belong to only one `Customer`; there are no many-to-many account groups.
- There are no connection tags, tag CRUD, or group/tag filters for fleet APIs.
- “Customer” semantics and account-group semantics are conflated.
- There is no bulk connect flow or batch OAuth connection session.
- Queues are per provider, not per account. There is no per-account serialization/rate bucket or account queue visibility.
- There is no group scheduling endpoint that clones the same content across members over a window.
- There is no deterministic stagger algorithm, minimum spacing rule, timezone handling, collision avoidance, or guarantee that group members never publish simultaneously.
- Existing `postingTimes` are recurring slot preferences, not staggered distribution.
- No tests cover group membership isolation, tag filtering, per-account ordering, stagger bounds, collision resolution, or partial group failure.

## 7. Platform truth and compose-time preflight — partial

### TikTok: partial

- `TikTokDto` and the composer distinguish `DIRECT_POST` from `UPLOAD` and explain that upload mode lands in the TikTok inbox rather than publishing: `libraries/nestjs-libraries/src/dtos/posts/providers-settings/tiktok.dto.ts` and `apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx`.
- `TiktokProvider.handleErrors()` recognizes TikTok’s unaudited-client private-only error after the platform rejects a publish.
- `SELF_ONLY` is a selectable privacy value.

Missing:

- There is no deployment/app audit-state configuration or capability value such as `auditStatus`, `publicPostingAvailable`, or `effectivePrivacy`.
- API/provider discovery, connected-account responses, create responses, receipts, and dashboard do not explicitly surface unaudited `SELF_ONLY` enforcement.
- The compose UI defaults to `PUBLIC_TO_EVERYONE`, even when an unaudited app would force/reject it.
- Creator-info is queried only for maximum video length; privacy options/audit restriction are not retained and validated at compose time.
- A TikTok upload-to-inbox completion is currently mapped to completed/published semantics with `postId: missing`, even though it is not confirmed live.

### Instagram Graph: partial

- The provider name/tooltip state that a business account linked to a Facebook Page is required.
- OAuth account discovery filters to Pages with `instagram_business_account`, which prevents many invalid connections.
- Backend compose validation runs provider DTO and `checkValidity`; Instagram currently checks non-empty media, carousel count, trial Reel constraints, and audio combinations.
- Media ingestion stores file size, MIME, dimensions, and duration metadata in `Media`.

Missing:

- Compose-time preflight does not revalidate the connected account type/Page link or return a structured preflight result.
- Instagram `checkValidity()` does not enforce the Graph API image/video format, byte-size, dimension, aspect-ratio, duration, frame-rate, and container constraints using stored media metadata.
- Validation returns loose booleans/strings, not stable machine codes and actionable corrections.
- There is no preflight endpoint/result in public API or MCP, and no tests for each Instagram account/media failure path.

## 8. Public status page — missing

### Foundations that exist

- Unauthenticated backend `/health` and `/readiness` expose database/Redis reachability in `apps/backend/src/api/routes/health.controller.ts`.
- The orchestrator has `/health/status` in `apps/orchestrator/src/health.controller.ts`.
- Private admin stats can count published posts/errors by provider in `libraries/nestjs-libraries/src/database/prisma/admin-stats/admin-stats.repository.ts`.
- `PublishingJob` provides source data for real delivery metrics once confirmation semantics are corrected.

### Missing

- No public `/status` frontend route or public status API exists.
- No persisted component-uptime samples/incidents/maintenance records exist.
- No rolling posting-success rate by platform is computed.
- Current published/error counts are not a reliable denominator and do not distinguish API acceptance from confirmed-live delivery.
- No privacy/minimum-sample policy prevents exposing tenant-sensitive or misleading low-volume data.
- No tests cover rolling windows, platform degradation, empty data, incident display, or cache behavior.

## 9. Billing alignment — missing and currently contradictory

### Current implementation

- Stripe Checkout/Portal, server-side entitlement resolution, replay-safe inbound Stripe webhooks, and pricing tests exist in `libraries/nestjs-libraries/src/services/stripe.service.ts`, `apps/backend/src/api/routes/billing.controller.ts`, and `libraries/nestjs-libraries/src/database/prisma/subscriptions/*`.
- The current catalog in `pricing.ts` is Free / Starter / Pro / Agency / Business, priced at $0 / $20 / $45 / $100 / $209 monthly.
- Current plans have channel caps of 0 / 10 / 25 / 60 / 145, `Subscription.totalChannels`, channel permission checks, and automatic disabling logic.
- Current post entitlement checks count queued and published posts from the billing-period start based on `publishDate` in `PostsRepository.countPostsFromDay()`.

### Conflicts with the required model

- Required tiers/prices are Free (50, five accounts), Starter $29 (~2,000), Growth $99 (~15,000), Scale $299 (~100,000). None match the current catalog.
- The paid product is explicitly channel/profile-capped and the UI sells channel quantities. That conflicts with unlimited connected accounts on every paid tier and “nothing priced per-profile.”
- Free currently has zero channels and zero posts rather than five accounts and 50 successful posts.
- Metering occurs before success: queued scheduled posts count. It is not based on confirmed successful posts.
- There is no immutable usage ledger keyed to one confirmed delivery, so retry, reconciliation, deletion, and billing-period behavior cannot be audited safely.
- Growth-only priority retries, dead-account detection, and SLA entitlements do not exist.
- The marketing pricing cards and in-app billing UI consume the conflicting catalog and channel language.

### Missing tests

- No tests assert successful-only charging, retry/reconciliation idempotency, failed/cancelled/data-problem exclusion, period boundaries, exact tier limits/prices, unlimited paid accounts, Free’s five-account cap, Growth entitlements, downgrade behavior, or Stripe catalog alignment.

## 10. Distribution surfaces — partial

### Documented/signed webhooks: partial

- Webhook CRUD, encrypted signing secrets, HMAC headers, integration filtering, retry attempts, SSRF protection, and a delivery-attempt ledger exist in `apps/backend/src/api/routes/webhooks.controller.ts`, `libraries/nestjs-libraries/src/database/prisma/webhooks/*`, and `apps/orchestrator/src/activities/post.activity.ts`.
- Operations docs mention signature verification and deduplication in `docs/OPERATIONS.md`.

Missing:

- There is no complete public webhook reference with versioned event schemas, lifecycle/failure/token/health events, retry policy, ordering, sample verification code, and replay guidance.
- Only `post.published` is emitted; it is not a delivery-receipt event contract.
- Event subscription selection is absent, and webhook availability is currently tier-limited (including zero on Free), conflicting with “full observability visible.”

### n8n: missing locally

- The UI links to the upstream external `n8n-nodes-postiz` package in `apps/frontend/src/components/public-api/public.component.tsx`.
- There is no official Publishly n8n node package in this monorepo, no Publishly credentials type, no receipt/health operations or triggers, and no tests/build/publish metadata.

### Make: missing

- No Make app/module definition, webhook trigger, action/search modules, documentation, or tests exist.

### MCP: partial

- A working MCP server and tools for listing integrations/groups, validation, scheduling, triggering, media import, and generation exist under `libraries/nestjs-libraries/src/chat/*`.
- It supports API-key and OAuth authentication.

Missing/incorrect:

- Server/agent branding still says `Postiz MCP` / `postiz` in `libraries/nestjs-libraries/src/chat/start.mcp.ts`.
- There are no explicit post get/list, receipt get/list/watch, fleet health, connection health, group stagger schedule, or reliability-preflight tools.
- MCP scheduling has no caller-provided idempotency key contract.
- Tool responses do not expose the required receipt/taxonomy/platform-truth fields.

## Cross-cutting architectural blockers

1. **Mutable job row rather than event ledger.** Taxonomy, receipts, status metrics, successful-post billing, and webhook replay all need an append-only delivery-event source of truth.
2. **Provider contract lacks reliability hooks.** There is no generic `verifyLive`, structured preflight, structured error classifier, retry hint, provider rate-limit metadata, or platform-account truth capability.
3. **Error handling is split across provider helpers, activities, workflow catches, `Post.error`, `Errors`, notifications, and `PublishingJob`.** A mandatory single failure-recording boundary does not exist.
4. **Creation has no request ledger.** Internal workflow deduplication happens after a post row is created and cannot provide API idempotency.
5. **Connection health data is absent.** Fleet UI, dead-account detection, token warning, and health webhooks need persisted observations/state.
6. **Billing uses authorization-time counts.** It must instead consume an idempotent success event after `confirmed_live`.
7. **Temporal compatibility.** Existing workflow/activity signatures and checked-in workflow versions must remain unchanged; new behavior needs new versioned workflow/activity entry points plus an observer/compatibility path for old executions.

## Required verification matrix before claiming the position

Every implementation item needs unit, repository/service, API, workflow, and UI/contract coverage as applicable. At minimum the final matrix must inject:

- every taxonomy class/code and an unknown raw exception;
- empty provider messages, non-Error throws, serialization failure, DB failure, queue failure, notifier failure, and webhook failure;
- 401/403/permission revocation, 400/422 media/content rejection, 429 with/without `Retry-After`, 5xx, timeout before send, timeout after send, connection reset, and provider-processing failure;
- confirmation found/not-found/private/deleted/delayed/unsupported and outcome-unknown reconciliation;
- concurrent duplicate creation on every public creation surface;
- token warning/expiry/refresh/password-change/recovery/staleness/dead-account paths;
- group/tag isolation, per-account queue ordering, stagger window/collision rules, and partial fleet failure;
- TikTok audited/unaudited plus Instagram account-link and every supported media constraint;
- successful-only metering under retries, webhook replays, reconciliation, deletion, and billing boundaries;
- lifecycle, failure, token, and health webhook delivery including exhausted webhook retries;
- status-page rolling-window math and low-volume/empty-data behavior;
- n8n, Make, and MCP contract tests against the same versioned API schemas.

Until those paths all end in a persisted classified event and an attempted observable notification, Publishly cannot truthfully claim that nothing fails silently.

## Post-implementation closure audit

Closure date: 2026-08-11  
Scope: current working tree plus a production-like PostgreSQL, Redis, Temporal,
backend, orchestrator, and Next.js runtime

The sections above preserve the mandatory pre-code baseline. The ordered
implementation has now closed the ten product gaps as follows.

| # | Requirement | Final state | Primary implementation evidence |
|---|---|---|---|
| 1 | Failure taxonomy | **Exists** | Required class/code/reason policy in `libraries/nestjs-libraries/src/reliability/post.failure.ts`; durable failure recording and webhook attempts in `libraries/nestjs-libraries/src/database/prisma/publishing-jobs/publishing-failure.service.ts`; provider boundary in `libraries/nestjs-libraries/src/integrations/social.abstract.ts`; current workflow in `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.9.ts`. |
| 2 | Delivery receipts | **Exists** | Append-only lifecycle repository/service under `libraries/nestjs-libraries/src/database/prisma/publishing-jobs/`; independent confirmation in `post-confirmation.service.ts`; public receipt/status routes in `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts`; lifecycle webhooks use the durable ledger. |
| 3 | Retries and idempotency | **Exists** | Retry policy in `libraries/nestjs-libraries/src/reliability/post.retry.policy.ts`; durable retry service/workflow; account queue repository/service; creation request ledger and `reliable-post-creation.service.ts`; every public creation surface requires `Idempotency-Key`. |
| 4 | Token health engine | **Exists** | Persisted observations/events and scheduled evaluation under `libraries/nestjs-libraries/src/database/prisma/connection-health/`; expiry/staleness/dead-account policy in `libraries/nestjs-libraries/src/reliability/connection.health.policy.ts`; signed health webhooks and fleet badges. |
| 5 | Fleet health dashboard | **Exists** | Tenant API projection under `libraries/nestjs-libraries/src/database/prisma/fleet-health/`; filter and reconnect UI under `apps/frontend/src/components/fleet-health/` and `apps/frontend/src/app/(app)/(site)/fleet/`; group/tag filters, per-account rates, badges, and bulk reconnect are covered by unit tests. |
| 6 | Fleet primitives | **Exists** | Group/tag schema and routes, bulk import/connect workflow, durable per-account queue under `database/prisma/account-queue/`, and stagger planning/distribution under `database/prisma/fleet-distribution/` plus `reliability/fleet.stagger.ts`. |
| 7 | Platform truth | **Exists** | Provider truth registry/service under `database/prisma/platform-truth/`; TikTok privacy/audit projection in `tiktok-platform-truth.ts`; Instagram account-link and media preflight in provider capabilities/truth services; compose-time API/UI failures use stable codes and reasons. |
| 8 | Public status | **Exists** | Real sampled status repository/service under `database/prisma/public-status/`; backend probes in `apps/backend/src/services/status/`; durable publishing-engine heartbeat/readiness in `apps/orchestrator/src/orchestrator-health.service.ts`; public UI at `apps/frontend/src/app/(marketing)/status/`. |
| 9 | Billing alignment | **Exists** | Authoritative catalog in `database/prisma/subscriptions/pricing.ts`; confirmed-live usage ledger/migration; paid tiers have unlimited account entitlement, Free has five; success-only metering is tested across replay/retry boundaries; marketing and in-app billing consume the same facts. |
| 10 | Distribution surfaces | **Exists in source** | Canonical `docs/WEBHOOKS.md`; official source package in `integrations/n8n-nodes-publishly/`; importable Make bundle in `integrations/make-publishly/`; scoped MCP reliability tools under `libraries/nestjs-libraries/src/chat/tools/`. Marketplace/catalog publication remains an external release action and the website says that plainly. |

### Go-live availability findings and closure

The production-like run found four concrete causes behind the service being
unavailable or falsely healthy:

1. Nine reliability migrations had not been applied to the local database.
   All 15 checked-in migrations are now deployed and the production Compose
   topology gates applications on the one-shot `migrate` service.
2. The installed Prisma client was incomplete. A Node 22 / pnpm 10.6.1 frozen
   install regenerated Prisma Client 6.5 and all three production builds now
   complete.
3. Temporal workers claimed 1,000,000 activity slots per queue, allowing work
   to be accepted locally and stall. `temporal.worker.limits.ts` now supplies
   bounded, tested execution/poller limits; the live bulk-import path completes.
4. Orchestrator health proved only Temporal control-plane connectivity. It now
   requires a recent durable workflow/activity/database heartbeat, and the
   production edge waits for that health check before serving public traffic.
5. A healthy restart could temporarily remain red because API/database/Redis
   evidence was stale until the next cron boundary, while short Compose grace
   periods could exhaust their failure budgets during genuine cold-start work.
   The designated `RUN_CRON=true` backend now writes and awaits fresh evidence
   during bootstrap, fails closed if that write fails, and backend/orchestrator
   receive a ten-minute cold-start grace without weakening their readiness
   probes. See ADR-017 and ADR-018 in `DECISIONS.md`.
6. Direct compiled frontend builds had no same-origin API fallback, so public
   status/deletion widgets could call Next's `/public/*` paths even while the
   API was healthy. Public clients now share a tested `/api` URL builder and
   Next proxies `/api/public/*` to the internal backend; the live website-origin
   status request returns the same operational ledger as the API. See ADR-020.
7. The optional browser-extension path could offer an upstream product's store
   listing. That fallback is removed, and extension-backed compatibility
   channels are disabled unless a reviewed Publishly extension ID and URL are
   configured. See ADR-019.

Production configuration is also fail-closed. `scripts/verify-production-env.cjs`
rejects placeholder/example values, weak or reused secrets, unsafe switches,
invalid URLs, incomplete storage/mail/Stripe groups, unsafe worker bounds, and
unconfigured networks in `PUBLISHLY_REQUIRED_PROVIDERS`. Backend and
orchestrator run strict checks before binding ports. The template intentionally
fails until an operator supplies real deployment values.

### Final verification evidence

- 76 unit suites / 540 tests passed, including injected database, queue,
  provider, receipt, webhook, configuration, and health failures.
- 4 live integration suites / 21 tests passed against the restarted backend,
  PostgreSQL, Redis, and Temporal; no suite was skipped.
- Frontend, backend, and orchestrator typechecks passed; repository lint
  passed; the final current-tree frontend, backend, and orchestrator production
  build passed. The last bootstrap-probe change was then backend-built and
  backend-typechecked again.
- Prisma schema validation passed and all 15 migrations are current.
- Public status reported `OPERATIONAL` for API, database, Redis, and publishing
  engine using current samples immediately after a rebuilt API restart. CORS
  allowed the production status client.
- All 72 sitemap routes and 21 same-origin homepage assets returned HTTP 200;
  the rendered site emitted `nosniff`, clickjacking denial, and referrer-policy
  headers.
- The n8n package dry-pack contained the expected nine files, all nine Make
  JSON artifacts parsed, and the MCP reliability contract passed unit tests.
- Production Compose expansion is valid. The environment template correctly
  fails the new release preflight until real operator-owned values replace its
  placeholders.

Code and local runtime are release-ready. Public deployment still requires the
operator-owned domain/DNS, immutable image tag, production secrets, S3 bucket,
verified email sender, live Stripe keys/webhook, platform application
credentials and approvals, backups, and the independent security/privacy review
listed in `docs/DEPLOYMENT.md` and `docs/SECURITY.md`.

## Platform-approval and website-alignment audit (pre-change)

Audit date: 2026-08-11  
Scope: the ten networks advertised in `data/public-product-facts.json`, their
provider implementations, production configuration, public legal routes, and
`docs/platform-approval/`

| Review requirement | State | Evidence and gap |
|---|---|---|
| One authoritative approval contract | **Missing** | Scopes and callbacks are repeated across provider files, `.env` templates, and `docs/platform-approval/*.md`; no machine-readable manifest or drift test exists. |
| Public reviewer-accessible product explanation | **Missing** | Home, status, privacy, terms, and deletion routes exist under `apps/frontend/src/app/(marketing)/`, but there is no no-login reviewer journey or permission-purpose page. |
| Truthful deployable legal pages | **Partial** | `apps/frontend/src/app/(marketing)/privacy/page.tsx` and `terms/page.tsx` are public but visibly say “Draft template,” lack operator identity, and omit material Google/YouTube Limited Use and revocation disclosures. |
| Meta least privilege and current API version | **Partial** | Facebook/Instagram providers request shipping capabilities, but `facebook.provider.ts`, `instagram.provider.ts`, and `.env.example` mix Graph v20/v22 instead of one current pin; retained review permissions are not tied to an evidence checklist. |
| TikTok Direct Post audit UX | **Partial** | Platform truth, preview, privacy, disclosure, and status polling exist, but compose defaults comments on, does not enforce all creator flags/current creator refresh, lacks mandatory music-usage consent, permits incomplete disclosure selection, and uploads server media with the wrong transfer mode. |
| YouTube OAuth verification and disconnect | **Partial** | Upload, read confirmation, channel data, and analytics use four applicable scopes in `youtube.provider.ts`; unused `youtube.force-ssl` is requested, regular integration deletion does not call Google's revocation endpoint, and public privacy copy lacks Google-specific disclosures. |
| LinkedIn review readiness | **Partial** | Member and organization flows exist in `linkedin.provider.ts`; documentation identifies self-serve versus Community Management review, but no fail-closed evidence manifest ensures every requested scope is demonstrated before the one-shot Standard-tier submission. |
| Pinterest Standard access readiness | **Partial** | Pin creation/read/analytics and board listing exist in `pinterest.provider.ts`, but unused `boards:write` is requested and there is no executable Trial-to-Standard evidence checklist. |
| X production access | **Partial** | OAuth 1 posting exists in `x.provider.ts`; production still needs an operator-funded developer project, Read+Write app permissions, exact HTTPS callback, and credits/spend guardrail. This is portal configuration, not a code-review approval. |
| Bluesky secure connection guidance | **Partial** | `bluesky.provider.ts` correctly accepts a user-created app password, but its UI/help documentation incorrectly tells users to disable two-factor authentication. Bluesky has no central app review or operator app secret. |
| Federated Mastodon connection | **Partial** | `mastodon.custom.provider.ts` already implements per-instance dynamic registration, but `integration.manager.ts`, `provider.env.registry.ts`, strict startup, and production env verification advertise/require a single static Mastodon server instead. Mastodon has no central review. |
| Production provider/legal readiness gate | **Partial** | `scripts/verify-production-env.cjs` validates launch credentials and runtime safety, but not legal identity, approval-manifest consistency, TikTok verified media origin, or provider scope/version drift. |
| Detailed acceptance runbook | **Partial** | `docs/platform-approval/` has useful per-provider notes, but lacks a single exact operator sequence, evidence filenames/scripts, portal field copy, least-privilege proof matrix, post-approval canaries, and explicit “do not submit yet” gates. |

### Launch conclusion

The application runtime and reliability layer are available locally, but the
current tree is not yet safe to submit for platform review or claim as a live,
website-aligned production service. Provider secrets cannot cure mismatched
scopes, incomplete consent behavior, draft legal disclosures, or an inaccurate
federated-provider setup. ADR-013 through ADR-015 define the closure work that
must pass before the operator handoff can truthfully become “supply real
identity, infrastructure credentials, billing keys, and approved app secrets;
then deploy.”

## Platform-approval and website-alignment closure audit

Closure date: 2026-08-11  
Scope: the same ten advertised networks, public website, production preflight,
provider connection/revocation behavior, and reviewer handoff

The pre-change findings immediately above are retained as the audit baseline.
Their current disposition is:

| Review requirement | Final state | Closure evidence |
|---|---|---|
| One authoritative approval contract | **Exists** | `data/provider-approval-manifest.json` is the canonical ten-provider scope, callback, credential, review, and source contract. `scripts/verify-provider-readiness.cjs` fails on code, public-page, documentation, or manifest drift. |
| Public reviewer-accessible product explanation | **Exists** | `apps/frontend/src/app/(marketing)/platform-review/page.tsx` renders the provider purposes and callbacks without authentication; `apps/frontend/src/proxy.ts` explicitly keeps it public. |
| Truthful deployable legal pages | **Exists, operator values required** | Privacy, Terms, Acceptable Use, Security, Contact, and Data Deletion are public and share configured legal identity/contact values. `scripts/verify-production-env.cjs` rejects placeholders instead of inventing an operator identity. |
| Meta least privilege/current version | **Exists in source** | The reviewed Facebook/Instagram/Threads scopes are manifest-pinned and verified; adapters share `META_GRAPH_VERSION=v25.0`; signed deletion callback/status routes are public. Advanced access and business verification remain Meta-controlled. |
| TikTok audit UX/platform truth | **Exists in source** | Compose-time creator-info refresh, no privacy default, capability gating, disclosure/music consent, production URL-pull enforcement, processing confirmation, and explicit unaudited `SELF_ONLY` truth are implemented and contract-tested. Audit approval and verified media-domain status remain TikTok-controlled. |
| YouTube verification/revocation | **Exists in source** | Least-privilege scopes replace `youtube.force-ssl`; explicit disconnect revokes before purge; durable refresh monitoring detects authoritative external revocation and transactionally removes provider-derived data. Google verification/quota remain external decisions. |
| LinkedIn review readiness | **Exists in source** | Member and organization journeys/scopes are separately documented and verified by the canonical contract. Community Management Standard access remains LinkedIn-controlled and must not be submitted before the live Page evidence is complete. |
| Pinterest Standard readiness | **Exists in source** | Unused `boards:write` was removed; Trial-to-Standard evidence, canary, and exact scopes are documented and verified. Standard access remains Pinterest-controlled. |
| X production readiness | **Exists in source** | OAuth posting/callback configuration and the exact portal/canary procedure are documented. A funded Read+Write developer project remains operator-controlled. |
| Bluesky secure connection | **Exists** | The connection UI requires a dedicated revocable App Password and no longer advises disabling 2FA. No central application approval or shared provider secret is required. |
| Federated Mastodon connection | **Exists** | Runtime uses per-instance dynamic app registration and production verification no longer requires a fictional global Mastodon client. No central approval is required. |
| Production provider/legal readiness gate | **Exists** | `pnpm verify:providers` and `pnpm verify:production` fail closed on manifest drift, placeholder legal identity, inconsistent origins, unsafe settings, missing selected-provider credentials, Meta version, and TikTok production media verification. |
| Detailed acceptance runbook | **Exists** | `docs/APPROVAL_AND_LAUNCH.md` gives the exact portal fields, least-privilege scopes, recording sequence, rejection traps, secret map, deployment commands, and post-approval canaries with dated official sources. |

### Final approval conclusion

The repository is safe to deploy and use for provider review once the operator
supplies the real domain/legal/infrastructure/billing values required by the
fail-closed production template. After a provider grants access, adding its
listed client ID/secret is the only provider-code configuration step; Bluesky
and Mastodon require no shared application secret. No repository change can
guarantee or substitute for a provider's independent approval, a verified
domain/business, truthful reviewer credentials, or a successful live canary.
