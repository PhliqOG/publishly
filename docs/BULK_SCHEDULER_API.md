# Bulk Scheduler authenticated API

Bulk Scheduler is fail-closed. Exact customer availability comes from
`GET /bulk/scheduler/capabilities`; unknown, killed, incomplete, or uncertified
tuples are disabled. Campaign requests cannot turn a disabled tuple on.

## Campaign intent ledger

- `POST /bulk/scheduler/campaigns` — create a campaign and revision 1. Requires
  `Idempotency-Key` (8–200 safe characters). An exact replay returns the same
  campaign with `replayed: true`; reuse with another body returns a classified
  conflict.
- `GET /bulk/scheduler/campaigns?state=&cursor=&limit=` — bounded cursor page;
  `limit` is 1–100.
- `GET /bulk/scheduler/campaigns/:campaignId` — current projection and exact
  current intent revision.
- `PATCH /bulk/scheduler/campaigns/:campaignId/intent` — append an intent using
  `expectedRevision`. It never overwrites an earlier revision.
- `GET /bulk/scheduler/campaigns/:campaignId/intents?cursor=&limit=` — immutable
  revision history.

Every intent is schema-versioned and stores destinations as exact capability
tuple IDs, local date/time intent, IANA timezone, weekdays, cadence, spacing,
conflict behavior, distribution mode, and deterministic ordering mode. Dates
remain local intent here; later reservations store their UTC realization too.

## Durable issues

- `GET /bulk/scheduler/campaigns/:campaignId/issues?state=&cursor=&limit=` —
  cursor page of open or resolved issues.
- `POST /bulk/scheduler/campaigns/:campaignId/issues/:issueId/resolve` — resolve
  without deleting the issue, using a stable resolution code and optional note.

Every issue includes:

- `issueClass`: `blocked`, `failed`, `conflicted`, `quarantined`, or `overflow`;
- `failureClass`: `recoverable`, `user_action_needed`, or `data_problem`;
- a registry-backed machine `code` and non-empty human `reason`;
- optional typed subject, bounded details, retryability, timestamps, and
  durable open/resolved state.

The code registry is
`libraries/helpers/src/bulk-scheduler/campaign.contract.ts`. Arbitrary codes are
rejected so UI behavior, alerts, support automation, and API clients cannot
drift. All identifiers are queried with the authenticated organization; an ID
from another workspace returns the same not-found outcome as an unknown ID.

## Native resumable video ingestion

- `POST /bulk/scheduler/campaigns/:campaignId/uploads` initiates up to 250
  files. It requires `Idempotency-Key`; the same key and descriptors return the
  same sessions after a lost response. Reuse with changed descriptors fails.
- `PUT /bulk/scheduler/campaigns/:campaignId/uploads/:uploadId/parts/:partNumber`
  accepts one multipart field named `chunk`. Chunks are at most 8 MiB and may
  arrive out of order. An exact part replay succeeds; changed bytes for an
  existing part fail classified.
- `POST .../uploads/:uploadId/complete` verifies every expected part before
  queueing validation. Missing part numbers are returned; nothing is skipped.
- `POST .../uploads/:uploadId/abort` durably records an aborted outcome and
  cleans only that session's private staging objects.
- `GET .../uploads?state=&cursor=&limit=` and `GET .../uploads/:uploadId` expose
  received bytes/parts, processing state, metadata, and any mandatory
  failure-class/code/reason.
- `GET /bulk/scheduler/assets/:assetId/thumbnail` streams a tenant-qualified
  private thumbnail with `private, no-store`; it never reveals an object URL.

Each file has an independent state:
`INITIATED -> UPLOADING -> ASSEMBLING -> VALIDATING -> NORMALIZING -> READY`,
or `QUARANTINED`, `RETRYABLE_FAILURE`, `FINAL_FAILURE`, `ABORTED`, or `EXPIRED`.
Publishly streams assembly, MIME-sniffs bytes, extracts FFprobe metadata,
normalizes unsupported-but-convertible video to H.264/yuv420p/AAC MP4, creates
a private WebP thumbnail, and hashes final bytes. Exact duplicates are
quarantined without failing their neighbors.

## Deterministic planning and execution

- `POST /bulk/scheduler/campaigns/:campaignId/plan` expands the current intent,
  writes jobs in 500-row chunks, retires only prior-revision future unpinned
  work, then keyset-pages every reservation through the authoritative calendar
  ledger. Published and pinned jobs are preserved.
- Expansion is capped at exactly 100,000 jobs by the shared planner/UI limit.
  The UI shows the expansion math and disables confirmation above that bound;
  a direct API attempt returns classified
  `campaign_expansion_limit_exceeded` and writes a durable
  `campaign_overflow` issue. It never truncates or silently drops excess work.
- `GET /bulk/scheduler/campaigns/:campaignId/jobs?state=&cursor=&limit=` exposes
  every expanded item, UTC and local/timezone intent, reservation/Post links,
  revision, pin, state, and outcome class/code/reason.
- `POST .../jobs/:jobId/pin` with `{ pinned, expectedRevision }` atomically
  updates the job and its committed authoritative reservation. Published slots
  cannot be unpinned.
- `POST .../jobs/:jobId/retry` requires `Idempotency-Key`. Only blocked or
  retryable items with a committed slot can re-enter the materializer/V109
  path. A mutation that may have been accepted returns
  `provider_outcome_needs_review`; it is never blindly reposted.
- `POST .../:campaignId/pause`, `/resume`, and `/cancel` require idempotency
  keys. Cancellation is chunked and retains published, pinned, dispatching, or
  ambiguous history.

Expanded job states are `PLANNED`, `RESERVING`, `RESERVED`, `CLAIMED`,
`MATERIALIZING`, `SCHEDULED`, `DISPATCHING`, `PUBLISHED`, `PAUSED`,
`CANCELLING`, `CANCELLED`, `RETRYABLE_FAILURE`, `FINAL_FAILURE`,
`NEEDS_REVIEW`, `CONFLICTED`, `OVERFLOW`, `QUARANTINED`, and `BLOCKED`.
Non-success terminal/blocked states are rejected by database constraints unless
the outcome class, stable code, and human reason are all present.

The bounded materializer creates an ordinary `Post` and `PublishingJob`, links
the private asset in its hook, and starts only `postWorkflowV109`. Queue state
is transport; campaign jobs and publishing attempts remain authoritative in
PostgreSQL. A mutation attempt is persisted before invocation. An ambiguous
timeout must reconcile by provider readback: `confirmed` completes,
proof-backed `absent` permits retry, and `inconclusive` becomes `NEEDS_REVIEW`.

## Controlled provider-canary reads

- `GET /bulk/scheduler/canary/preflight?tupleId=&integrationId=` is
  authenticated, tenant-qualified, and read-only. It returns only the exact
  build revision, matrix hash, runtime gates, safe tuple fields, safe
  destination identity/health, calendar mode, and per-integration decision. It
  never returns connection tokens or private media capabilities.
- `GET /posts/:postId/publishing-job` includes bounded safe attempt fields and
  safe per-asset provider-grant/fetch history. It omits activity keys, mutation
  fingerprints, sealed evidence, capability tokens, and storage keys.

These reads support the operator-only workflow in
[BULK_SCHEDULER_CANARY.md](BULK_SCHEDULER_CANARY.md). They do not certify or
enable a tuple and cannot bypass the matrix or either kill switch.
