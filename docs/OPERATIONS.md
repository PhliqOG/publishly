# Operations

## Probes and dashboards

| Check                                     | Healthy result                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| backend `GET /health` or `GET /readiness` | 200 with PostgreSQL and Redis `true`                                     |
| worker `GET :3002/health/status`          | 200 `{status:"ok"}` after Temporal connection/workers start              |
| public `GET /public/status`               | aggregate current state, component uptime, and platform posting evidence |

Run `pnpm test:e2e:browser` against a running stack for the public-site,
responsive-navigation, authentication-entry, and browser-signup canaries. Set
`E2E_BASE_URL` when the frontend is not available at `http://localhost:4200`.
| frontend `GET /` | 200 marketing/app response |
| `/admin/operations` | dependency, queue/job, provider, storage, API, webhook, subscription, and audit summaries |
| Temporal UI | workflow history; private/VPN/loopback only |

Cold backend/worker boots can exceed one minute. Use the configured healthcheck
start period and inspect logs before declaring a crash. Application logs are
structured around request ID, job/post/workspace ID, provider, state, and safe
error category. Never paste token-bearing provider URLs or authorization headers
into tickets.

## Publishing triage

1. Open the destination's `PublishingJob` (`/posts/:id/publishing-job` or the
   operations page) and note state, attempts, category, and request/job IDs.
2. Find Temporal workflow `post_<postId>` and the provider task queue.
3. `RETRYING` is safe only when the adapter proved the request was not sent.
   Check provider rate limits and token-refresh history.
4. For `outcome_unknown`, inspect the authorized provider account for the
   expected content/time. If found, reconcile it as published; if absent after
   provider processing settles, make a deliberate manual retry. Never bulk
   replay this category.
5. For one failed destination in a group, leave published siblings untouched.
   Retry/correct only the failed destination when safe.

After an outage, the missed-post workflow re-signals due posts when `RUN_CRON`
is enabled on exactly one backend. Validate job state before running any custom
requeue script.

## Public status evidence

Set `RUN_CRON=true` on exactly one backend. That instance records API,
PostgreSQL, and Redis probes at second 5 of every UTC minute. The versioned
`publicStatusHeartbeatWorkflowV101` records the publishing-engine component
through Temporal once per minute. Do not backfill missing rows: gaps are the
evidence of downtime and intentionally reduce uptime after a component's first
sample.

The public page reads only bounded aggregates and retains samples for 45 days.
If a component says `status_probe_stale`, verify the cron owner or the
publishing heartbeat before assuming the dependency itself failed. If
`GET /public/status` returns `503 status_data_unavailable`, use the direct
readiness probes and database logs; the page deliberately treats an unreadable
ledger as unknown rather than showing the last green value. Posting rates come
from terminal `PublishingJob` rows and must never be edited or seeded for
marketing presentation.

## Token and provider failures

- 401/invalid grant: automatic refresh is attempted when the provider supports
  it. An unrecoverable connection becomes `refreshNeeded`; ask the tenant to
  reconnect through OAuth.
- Missing app variables: provider discovery lists exact `missingEnv`; add the
  complete pair/group and redeploy. Do not add only one value under strict mode.
- Permission error after reconnect: compare granted scopes with
  [PLATFORM_INTEGRATIONS.md](PLATFORM_INTEGRATIONS.md) and the provider portal's
  approved products/access tier.
- Rate limit: respect provider reset/retry guidance and reduce the provider's
  worker concurrency only after measuring queue age.
- Never edit sealed token columns manually.

## Bulk imports

Lifecycle: preview/validated → processing → completed,
`completed_with_errors`, or failed. Commit starts a Temporal workflow; the HTTP
request returns without processing all rows. Use `GET /bulk/import/:id` for
progress and `GET /bulk/import/:id/report.csv` for the downloadable row report.
Worker checkpoints make long imports observable. Before resubmitting after a
failure, compare created group IDs so valid rows are not duplicated.

## Bulk Scheduler campaign ledgers

`BulkCampaign` is only the current projection. `BulkCampaignIntent` is the
append-only source for every intent revision, and `BulkCampaignIssue` is the
durable source for blocked, failed, conflicted, quarantined, and overflow
outcomes. Queues may carry these IDs but are never state authority.

Operational checks:

- `bulk_campaign_destinations_blocked`: inspect the returned issue codes and
  the Stage 1 tuple matrix. Do not enable an uncertified row to clear an alert.
- `bulk_campaign_issue_recorded`: group database rows by stable `code` and
  `issueClass`; page through the authenticated campaign issue API rather than
  loading an unbounded campaign.
- `bulk_campaign_created` versus `bulk_campaign_create_replayed`: a sustained
  replay ratio above 20% can indicate a client retry loop; request hash
  mismatches return `idempotency_key_reused` and must not be retried with the
  same key.
- Alert if open `failed` issues rise for 10 minutes, any
  `provider_timeout_ambiguous` or `needs_review` issue remains open for 15
  minutes, or a campaign remains in a non-paused transitional state for 30
  minutes. Stage-specific workers add narrower queue-age alerts later.
- A campaign/intent mismatch (current revision missing) is invariant failure:
  stop its workers, preserve the rows, and restore/reconcile from audit events;
  never fabricate an intent from a queue payload.

Migration and rollback:

- Deploy `20260812230000_bulk_campaign_ledgers` before application code. It is
  additive and leaves existing posts unchanged.
- Immediate product rollback is `BULK_SCHEDULER_KILL_ALL=true`; keep the tables
  and stop materializers so an in-flight campaign remains inspectable.
- Do not drop ledger types/tables during an incident. Schema rollback requires
  a reviewed forward migration after backup and retention review. The API code
  can be reverted safely while the additive tables remain.
- Verify with `prisma migrate status`, the campaign contract suites, and a
  cursor page from a non-production test tenant before enabling workers.

## Bulk Scheduler upload, materializer, and ambiguity operations

Keep `BULK_SCHEDULER_KILL_ALL=true` until the exact Stage 8 tuple is certified.
Canary operation additionally requires the exact tuple and designated test
integration allowlists. Do not place a customer integration in either list.

The orchestrator maintenance cycle first claims bounded upload sessions, then
bounded due campaign jobs, and finally advances cancellation batches. Database
leases make a crashed claim recoverable. Default materialization horizon is 24
hours; tune batch/horizon only after the Stage 7 artifact remains within the
deployment's memory and latency budgets.

Monitor and alert on:

- `bulk_upload_processing_failed`, retry exhaustion, leases older than twice
  their configured duration, and upload sessions approaching expiry;
- `bulk_campaign_jobs_overflow`, `calendar_conflict`, reservation-link races,
  or a plan whose persisted count differs from expansion math;
- claimed/materializing jobs with expired leases, a sustained due-job backlog,
  and cancellation batches that make no progress;
- `provider_timeout_ambiguous`, `needs_review`, and any mutation attempt left
  `STARTED` after its activity timeout;
- capability or dispatch kill-switch blocks by exact tuple, never by secret
  capability URL.

For an ambiguous provider result, inspect the sealed attempt evidence and the
designated provider account. Never edit the job back to retryable in SQL and
never invoke the adapter directly. Provider readback must resolve to confirmed
or proof-backed absent. Inconclusive items stay `NEEDS_REVIEW`.

Rollback is fail-closed: set `BULK_SCHEDULER_KILL_ALL=true`, pause affected
campaigns, and retain all campaign, issue, reservation, attempt, grant, and
fetch ledgers. To stop private fetches, revoke grants and set the media kill
switch. To stop calendar mutations, use `CALENDAR_RESERVATION_KILL_ALL=true`.
Do not fall back to direct Post writes or delete additive migrations during an
incident.

### Mandatory scale and tenant gates

Every release that can execute Bulk Scheduler work must run these against a
dedicated migrated PostgreSQL database whose database name contains `test` or
`ci`:

```bash
pnpm run prisma-migrate-deploy
pnpm run test:bulk-scheduler:tenant
NODE_OPTIONS=--max-old-space-size=4096 pnpm run test:bulk-scheduler:load
```

Neither gate conditionally skips. The load gate must expand exactly 1,000
private asset ledgers across 100 designated, non-publishing Instagram test
connections, reserve all 100,000 jobs through the authoritative calendar
ledger, page all rows, claim disjoint bounded batches, exercise classified
retry and pause/resume, preserve one pinned slot, cancel the other 99,999 jobs
in batches of at most 500, and prove that no `Post` or `PublishingJob` was
created. It writes the unredacted machine result to
`docs/evidence/bulk-scheduler/benchmarks/stage7-100k.json`; CI retains that file
as an artifact even on failure.

Fail the release if the artifact is absent, is not `status: passed`, reports a
cardinality mismatch, crosses its 1,536 MiB RSS or 15-minute plan/reservation
bound, creates publisher rows, loses tenant isolation, or leaves an
unclassified cancellation. Never lower a workload or turn the suite into a
skip to clear CI. Fix the query/batch boundary, rerun from an exact generated
test fixture, and retain the prior failure in the stage evidence.

### Controlled real-provider certification

After the mandatory internal gates pass, follow
[BULK_SCHEDULER_CANARY.md](BULK_SCHEDULER_CANARY.md). Preflight is read-only;
execution needs both an exact confirmation phrase and an explicit attestation
that the allowlisted destination is Publishly-owned and contains no customer
data. The run must use a non-sensitive local MP4 and a unique evidence path.

Treat `sent`, a provider `2xx`, a container ID, a mock pass, absent credentials,
or a skipped canary as NO-GO. For provider-pull tuples, also require a served
GET in the private fetch ledger. Alert immediately on any canary
`NEEDS_REVIEW`, unclassified terminal outcome, rejected/failed private fetch,
unresolved attempt, build mismatch, or evidence-redaction failure. The harness
never retries a possibly accepted mutation.

After review, retain the evidence under immutable release storage. Matrix
certification and default customer eligibility are separate reviewed changes.
Do not delete global/per-tuple kill switches after a pass.

## Calendar reservation shadow rollout

Use [CALENDAR_RESERVATION_ROLLOUT.md](CALENDAR_RESERVATION_ROLLOUT.md) for the
bounded legacy backfill, conflict classification, zero-mismatch verification,
dual-write soak, bounded authority promotion, alerts, tenant allowlist, and
rollback. Do not enable authoritative enforcement from configuration alone;
each tenant requires a verified watermark plus `authorityActivatedAt`, and
`pnpm run verify:calendar-writers` must pass in CI and before deployment.

## Media and storage

Bulk Scheduler provider transport has a separate deployment and incident
runbook in [PRIVATE_PROVIDER_MEDIA.md](PRIVATE_PROVIDER_MEDIA.md). Its bucket,
access path, grants, and fetch ledger are deliberately separate from public
media. Do not substitute `Media.path`, a public bucket URL, or a raw presigned
object URL.

- Rising `PENDING` metadata: verify FFmpeg/Sharp availability and worker/backend
  logs; signed uploads must be completed/registered by the client.
- Quota mismatch: compare S3 inventory with non-deleted tenant `Media` rows and
  thumbnails. Duplicates are tenant-local and hash-based.
- Cleanup: objects are physically removed only after
  `MEDIA_DELETE_RETENTION_DAYS`, under a Redis lock. Confirm configured storage
  root/bucket before manually deleting anything.
- Abandoned multipart uploads are bucket-lifecycle work; configure automatic
  abort rather than scanning unbounded uploads in a web request.
- URL import blocked: the target or redirect resolved to a non-public address,
  unsupported protocol, unsafe DNS result, excessive size, or timeout. Do not
  disable SSRF protection to make an arbitrary URL work.

## Webhooks

Stripe:

- signature failures: verify the endpoint-specific `STRIPE_SIGNING_KEY` and raw
  body forwarding at the proxy;
- replay: inspect `ProcessedWebhookEvent`; duplicate event IDs are ignored;
- handler failure releases the event claim so Stripe can redeliver.

Outgoing customer hooks:

- verify URL remains public HTTPS and its receiver responds inside timeout;
- inspect `WebhookDeliveryAttempt` in `/admin/operations`;
- receiver should deduplicate `X-Publishly-Event-Id` and validate the HMAC using
  the raw body, `X-Publishly-Timestamp`, and stored hook secret;
- rotate a secret after suspected exposure and update the receiver before the
  next event.

Meta deletion:

- callback URL is `/api/public/meta/data-deletion` in the reference deployment;
- 503 means no matching Meta app secret is configured;
- 400 means malformed/forged `signed_request` or the wrong app secret;
- completed requests are status-checkable through their opaque `/data-deletion`
  confirmation URL and audited as a system action.

## Billing

- Treat Stripe as payment-event truth and the subscription row as synchronized
  enforcement state.
- Treat `SuccessfulPostUsage` as usage truth. A row is created only with a
  `confirmed_live` receipt; never repair quota by counting Post or
  PublishingJob rows, because those operational records can be deleted.
- A failed usage-ledger write rolls back confirmed-live receipt persistence and
  must surface as an activity failure for retry. Do not mark a post confirmed
  manually without the matching idempotent usage event.
- The public catalog is Free, Starter, Growth, and Scale. Paid
  `totalChannels=2147483647` is a compatibility sentinel rendered as unlimited,
  never a quantity to edit or invoice. Historical `ULTIMATE` means Scale.
- Compare webhook event ID, subscription/customer IDs, and replay ledger before
  changing a tenant manually.
- Failed payment/cancellation states must remove paid entitlements through the
  normal webhook/service path.
- Test upgrades, downgrades, cancellation-at-period-end, trial, failed payment,
  Portal return URLs, confirmed-live usage replay, and Free account enforcement
  in Stripe test mode after any pricing change.

## Audit and customer requests

Workspace admins can export a secret-free bundle; only the owner can delete the
workspace. Audit-log writes are non-blocking and log a warning on failure. Data
deletion is not a substitute for deleting platform-side posts—the tenant still
controls those at the platform.

Operator impersonation is sensitive: use only for a documented support case,
keep the admin session protected with MFA/edge controls, and review the audit
trail afterward.

## Test provider canaries

Enable only in development/staging:

- normal: one scheduled destination reaches `PUBLISHED` and one sink event;
- `TEST_PROVIDER_FAIL_TIMES=1`: one safe transient retry, two attempts, one
  sink event;
- `TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES=1`: `FAILED/outcome_unknown`, one attempt,
  one sink side effect;
- `TEST_PROVIDER_MODE=pending`: exercises status/finalize flow.

Restore both failure counters to `0` and disable the provider before production.

## Maintenance cadence

Daily: health, oldest queue age, failed/ambiguous jobs, webhook failures,
storage growth, backup freshness. Weekly: provider/app alerts, Stripe failures,
dependency/security alerts, disk/DB/Redis/Temporal capacity. Monthly: restore
sample, key/access review, audit/error retention, platform version notices.
Quarterly: full restore drill, tenant-isolation/security suite, provider canary
matrix, incident exercise.
