# Codebase Reality — Publishly claims audit (2026-08-10)

Auditor: context-analyst agent (read-only session; report saved by main session).
All paths absolute. Backend = NestJS; background execution is **Temporal**
(`apps/orchestrator`), not BullMQ — there is no `apps/workers` or `apps/cron`.

## Claims-truth table

| # | Claim | Verdict | Load-bearing evidence |
|---|---|---|---|
| 1 | Every post gets a delivery receipt | TRUE-TODAY | `PublishingJob` model + `Post.releaseId/releaseURL` |
| 2 | Every failure gets a webhook | ~~ABSENT~~ → **SHIPPING as of 2026-08-10** (see update note at the end of this file) | `post.failure` wired through `publishing-failure.service.ts` |
| 3 | A failure reason on every post | TRUE-TODAY | `Post.error`, `Errors` row, `lastError` + `failureCategory` |
| 4 | Automatic retries | TRUE-TODAY | Temporal retry policies + workflow loop + hourly sweeper |
| 5 | Token-expiry warnings before failure | PARTIAL | refresh is proactive; the *warning* is post-failure only |
| 6 | Dead-account detection | TRUE-TODAY | `refreshNeeded` + disconnect + notify + block |
| 7 | Live posting-success-rate | PARTIAL | data exists; no org aggregate endpoint |
| 8 | Billed on successful posts only | ABSENT | counts scheduled posts, checked pre-publish |
| 9 | AI features | TRUE-TODAY | OpenAI image/text/slides/voice + Copilot agent |
| 10 | Analytics | TRUE-TODAY (partial breadth) | 12 providers implement analytics; 3 marketed networks don't |

---

## 1. Delivery receipt — TRUE-TODAY

- `libraries\nestjs-libraries\src\database\prisma\schema.prisma:413-493` — `Post.releaseId`, `Post.releaseURL`, `Post.error`; `PublishingJob { state, idempotencyKey, attempts, nextAttemptAt, startedAt, completedAt, lastError, failureCategory, providerPostId, providerUrl }`, unique per `postId`.
- `schema.prisma:1010-1027` — `State { QUEUE PUBLISHED ERROR DRAFT }` and `PublishingJobState { DRAFT SCHEDULED QUEUED PROCESSING PUBLISHED PARTIAL_SUCCESS RETRYING FAILED CANCELLED }`.
- `...\posts\posts.service.ts:85-98` — on success, `updatePost` writes `releaseId/releaseURL` **and** transitions the job to `PUBLISHED` with `providerPostId`/`providerUrl` and clears error.
- Job rows are guaranteed: `posts.service.ts:1002` (create), `:1273` (status change), `:1316` (reschedule) call `PublishingJobRepository.ensure`.
- Readable: `apps\backend\src\api\routes\posts.controller.ts:72-109` (`GET /posts/publishing-jobs`, `GET /posts/:id/publishing-job`) and `apps\backend\src\public-api\routes\v1\public.integrations.controller.ts:107-117` (`GET /v1/posts/:id/status`).

Caveats to keep out of copy: some providers cannot return an ID and store the sentinel `releaseId = 'missing'`, requiring the user to pick the live post manually (`posts.service.ts:100-158`, `apps\frontend\src\components\launches\missing-release.modal.tsx`). There is **no read-back verification** that the post still exists after publish. No customer-facing receipt UI — the publishing-job endpoints are consumed only by the admin console.

## 2. Failure webhooks — ABSENT

- `apps\orchestrator\src\activities\post.activity.ts:402-485` is the only webhook dispatcher. Event type is hardcoded `'post.published'` (lines 421, 439, 453, 466). Grep across `*.ts` finds no other event string.
- `apps\orchestrator\src\workflows\post-workflows\post.workflow.v1.0.6.ts:568` — `sendWebhooks(...)` is called only **after** the posting loop succeeds; every failure branch (`return false` at lines 340, 355, 435, 473, 506, 511, 529, 553, 557, 563) exits before it.
- What *does* exist and is genuinely good: HMAC-SHA256 signing (`X-Publishly-Signature: t=…,v1=…`), event IDs, 10s timeout, SSRF-pinned dispatcher, 3 attempts with 1s/5s backoff, and a `WebhookDeliveryAttempt` audit table (`schema.prisma:680-700`) with per-attempt status/statusCode/durationMs/error.
- Honest sentence available today: "Successful posts fire a signed, retried webhook with a delivery log." Not: "every failure gets a webhook."

## 3. Failure reason per post — TRUE-TODAY

- Storage: `Post.error` (`posts.repository.ts:418-453`) plus an `Errors` row (message, platform, postId, body) on every ERROR-with-body transition.
- Taxonomy, two layers:
  - Workflow-level, from provider-thrown `ApplicationFailure` types — `refresh_token`, `bad_body`, `provider_transient` (declared in `libraries\nestjs-libraries\src\integrations\social.abstract.ts:44,59,77`) mapped in `post.workflow.v1.0.6.ts:215-256` to `retry | stop | bad-body | timeout | transient | unknown`.
  - Persistence-level, `posts.service.ts:1178-1214` derives `failureCategory` ∈ `authentication | rate_limit | outcome_unknown | provider_validation | provider_error`, plus `provider_transient` (workflow line 541) and `outcome_unknown` (line 267). Messages are `Bearer`-redacted and truncated to 2000 chars.
- Surfaced: `apps\frontend\src\components\launches\calendar.tsx:1052-1062` — red ring + tooltip showing `post.error`; in-app notification + email on failure (`notification.service.ts:41-86`, `sendEmail=true, digest=false` → immediate send).
- Weak spot: `failureCategory` is derived by substring matching on the error message, not by a first-class error code. Marketing "classified" language should stay soft.

## 4. Automatic retries — TRUE-TODAY (rules are specific, and deliberately conservative)

- Activity-level (`post.workflow.v1.0.6.ts:19-75`): normal activities `maximumAttempts: 3`, `initialInterval: '2 minutes'`, `backoffCoefficient: 1`; status checks 3 attempts at 10s.
- **Publish mutations are explicitly `maximumAttempts: 1`** (lines 45-57) to prevent duplicate posts. Timeouts and `unknown` outcomes are *never* replayed — they call `markUnconfirmed` (lines 261-283) and notify the user to check the account.
- Workflow-level: 5-attempt loop (`iterate`, line 79); transient backoff `[15, 60, 300, 900, 1800]` seconds (line 532); token-refresh retry after 5s (line 494); pending-post polling up to 90 checks at 20s (~30 min).
- Sweeper: `apps\orchestrator\src\workflows\missing.post.workflow.ts` runs every hour, calling `searchForMissingThreeHoursPosts` → `posts.repository.ts:36-64`: posts with `state='QUEUE'`, `publishDate` in the last **2 days**, whose integration is not `refreshNeeded`/`inBetweenSteps`/`disabled`; re-signals `postWorkflowV106` with `workflowIdConflictPolicy: 'USE_EXISTING'`.
- Idempotency: workflow id `post_${postId}`, `PublishingJob.idempotencyKey = publish:${postId}`.

## 5. Token-expiry warnings before failure — PARTIAL

- Proactive refresh is real: `apps\orchestrator\src\workflows\refresh.token.workflow.ts` sleeps until `tokenExpiration` then refreshes, in a loop; started per integration via `RefreshIntegrationService.startRefreshWorkflow` (only for providers with `refreshCron`). Batch path `integration.service.ts:217-254` and CLI task `apps\commands\src\tasks\refresh.tokens.ts`.
- But: the refresh fires **at** expiry, not ahead of it, and **no notification is sent before a token dies**. The only message is *after* a refresh attempt fails: `informAboutRefreshError` (`integration.service.ts:194-207`) → in-app + email "Could not refresh your X channel… connect it again".
- So "you find out before it breaks" is not shipping. "We refresh tokens automatically, and tell you the moment one can't be refreshed" is.

## 6. Dead-account detection — TRUE-TODAY (reactive, not a health probe)

- `refresh.integration.service.ts:81-99` — refresh failure sets `refreshNeeded`, notifies, and disconnects.
- `integration.repository.ts:208-218` and `:371-381` — both `disconnectChannel` and `refreshNeeded` set `Integration.refreshNeeded = true` (indexed, `schema.prisma:374`).
- Consequences are enforced: dead channels are excluded from the sweeper (`posts.repository.ts:39-43`), and a post firing on one is failed with `'Refresh channel needed'` + notification (`post.workflow.v1.0.6.ts:156-173`); `'Channel disabled'` for `disabled` (lines 176-193). Same disconnect path triggers from analytics reads (`integration.service.ts:375`) and `posts.service.ts:140,213`.
- Caveat: detection happens when a refresh/post/analytics call fails — there is no independent liveness poll of connected accounts.

## 7. Live posting-success-rate — PARTIAL

- The data model supports it: `PublishingJob @@index([organizationId, state])`.
- A groupBy already exists but is **superadmin, global, cross-org**: `apps\backend\src\api\routes\admin.controller.ts:153-172` (`publishingJob.groupBy({by:['state']})` + 25 most recent FAILED/RETRYING with `failureCategory`/`lastError`), rendered in `apps\frontend\src\components\admin\admin-operations.component.tsx`.
- The org-scoped endpoint is a **paginated list only** — `posts.controller.ts:72-99` → `publishing-job.repository.ts:75-98`, cursor-based, `take` capped at 100. No count/aggregate. A customer success-rate widget requires a new endpoint; it cannot be assembled honestly from what ships.

## 8. Billed on successful posts only — ABSENT (this one is actively contradicted)

- Enforcement point: `apps\backend\src\services\auth\permissions\permissions.service.ts:127-144`, a **pre-create** policy check (`@CheckPolicies([Create, Sections.POSTS_PER_MONTH])` on `public.integrations.controller.ts:120`).
- The counter counts the wrong thing: `posts.repository.ts:491-509` — `publishDate >= billing-month anchor` AND (`state = QUEUE` and not deleted) OR `state = PUBLISHED`. Scheduled-but-unpublished posts count; ERROR posts are excluded only incidentally.
- Quota is effectively infinite anyway: `pricing.ts` sets `posts_per_month: 1000000` on STANDARD/TEAM/PRO/ULTIMATE and `0` on FREE. Billing is per-tier channel/seat/webhook entitlements via Stripe, with no per-post metering table anywhere.

## 9. AI — TRUE-TODAY

- `libraries\nestjs-libraries\src\openai\openai.service.ts` — `generateImage` (`chatgpt-image-latest`), `generatePromptForPicture`, `generateVoiceFromText`, `generatePosts`, website-content extraction, `generateSlidesFromText`; text models `gpt-4.1`.
- Chat copilot: `apps\backend\src\api\routes\copilot.controller.ts:31-59` — CopilotKit runtime + `OpenAIAdapter({model:'gpt-4.1'})`, lazily imported, returns **503 `AI_PROVIDER_UNCONFIGURED`** when `OPENAI_API_KEY` is unset.
- Agent tooling: `libraries\nestjs-libraries\src\chat\` (Mastra) with tools for integration list, schedule post, validation, video generation; 3rd-party video via `3rdparties\heygen`, `3rdparties\reelfarm`.
- Entitlement-gated: `pricing.ts` `ai`, `image_generator`, `image_generation_count`, `generate_videos` (FREE has none).

## 10. Analytics — TRUE-TODAY, with named gaps

- Per-channel: `apps\backend\src\api\routes\analytics.controller.ts:51-58` → `integration.service.ts:335-413` calls `provider.analytics(...)`, Redis-cached 1h, and best-effort persists to `AnalyticsSnapshot` (`:404-406`).
- History with tier-based retention: `analytics.controller.ts:24-49` (`analytics_retention_days` 7/90/365/730/1825), auto-pruned; comment in code explicitly states values are never interpolated.
- Per-post: `analytics.controller.ts:60-67` → `posts.service.ts:168-249` `provider.postAnalytics(internalId, token, releaseId, date)`.
- Short-link clicks: `posts.service.ts:251-261`.
- Coverage: only 12 files under `libraries\nestjs-libraries\src\integrations\social\` implement `analytics`/`postAnalytics` — gmb, facebook, instagram, instagram.standalone, linkedin.page, pinterest, threads, tiktok, x, youtube (+ dribbble partial, + testprovider). **Bluesky, Mastodon and personal LinkedIn have none**, yet all three are listed in `MARKETING.networks`.

---

## Contradictions with the existing `marketing.config.ts`

File: `apps\frontend\src\components\marketing\marketing.config.ts`

1. **`reliability[2]` "Missed slots recover on their own" — the phrase "or a token refresh" is false, and "Missed doesn't mean lost" is over-stated.** The sweeper (`posts.repository.ts:39-43`) explicitly *excludes* integrations with `refreshNeeded`/`inBetweenSteps`/`disabled`, and the workflow marks any post firing on such a channel as terminal `ERROR` ("Refresh channel needed", `post.workflow.v1.0.6.ts:166-173`). Once that happens the post leaves `QUEUE` and is **never** re-queued after the user reconnects. Also unstated: the sweep window is only 2 days.
2. **`reliability[1]` "The calendar shows exactly what happened, per network" — "exactly" overreaches.** The calendar shows a red ring and a raw `post.error` tooltip (`calendar.tsx:1052-1062`). There is no per-network status/receipt view; `providerUrl`, `attempts`, `failureCategory` and the whole publishing-job API are surfaced only in the *admin* console.
3. **`reliability[1]` "A post to 6 networks is 6 deliveries" — TRUE**, confirmed: one `PublishingJob` + one Temporal workflow `post_${postId}` per destination post (`posts.service.ts:1002-1014`, `:718-783`).
4. **`reliability[0]` "durable workflow with a deterministic identity… conservative retry rules… even in ambiguous timeout cases" — TRUE and, if anything, undersold.** The `maximumAttempts: 1` on publish mutations and the `markUnconfirmed` path are the strongest honest reliability material in the repo.
5. **`security` array — all four verified TRUE-TODAY** (AES-256-GCM sealing via `helpers/auth/crypto.v2` `open`/`withOpenToken`; OAuth-only providers; hashed revocable API keys with `ApiKey.revokedAt`/`lastUsedAt`; `AuditLog` model + `audit-logs.controller.ts`). No contradiction found.
6. **`sub` "10 networks" vs analytics breadth** — not a false claim about posting, but any future *analytics* claim must exclude Bluesky, Mastodon and personal LinkedIn.

## Bottom line for the repositioning

"Nothing fails silently" is defensible **inside the product** (post state + error + failure category + in-app/email notification on every failure path) but **not at the integration boundary** — the webhook surface is success-only, and there is no org-facing success-rate or receipt UI. The two claims that would be dishonest today are #2 (failure webhooks) and #8 (billed on successful posts only); #5 and #7 need narrowing rather than dropping.
