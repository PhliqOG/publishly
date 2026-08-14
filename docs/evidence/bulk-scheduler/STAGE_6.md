# Stage 6 evidence - V109 materialization, native ingestion, and ambiguous reconciliation

Recorded: 2026-08-13 (America/New_York)

Decision: `DECISIONS.md`, ADR-031 (with the native-ingestion amendment to
ADR-028). Stage 6 is complete in code and remains fail-closed for customer
traffic. No real provider post was triggered.

## Delivered contract

- Native file/folder selection initiates resumable, deterministic 8 MiB private
  chunks. The database owns received-part state and exact replay behavior.
- Streaming assembly performs byte sniffing, FFprobe metadata extraction,
  H.264/yuv420p/AAC normalization when necessary, private WebP thumbnails,
  SHA-256 duplicate quarantine, and independent classified outcomes. A bad
  neighbor does not abort the batch.
- The planner implements exact cross-post/distribute expansion, per-account or
  campaign cadence, weekdays, IANA timezone/local intent, DST gaps/folds,
  fixed/even slots, conflict policy, upload/filename/manual/seeded order, and
  visible overflow. `best_time` fails closed because it is not matrix-backed.
- Plan writes are chunked at 500. Reservation reads are keyset-paged at 500 and
  every slot uses the authoritative generic reservation ledger. Pin/unpin
  changes the campaign job and reservation atomically. Future unpinned work is
  replaceable; published/pinned work is preserved.
- The materializer claims bounded due rows with `FOR UPDATE SKIP LOCKED`, then
  creates normal Posts through `PostsService`. Its hook attaches private media
  to the exact `PublishingJob`; only `postWorkflowV109` publishes.
- `PublishingAttempt` is durable before provider mutation. Mutation replay
  requires readback after a possibly accepted timeout. Confirmed completes,
  proof-backed absent may retry, and inconclusive becomes `NEEDS_REVIEW`.
- Pause/resume/cancel, safe per-item retry, intent revision/replanning, issue
  pages, job pages, upload pages, and UI outcomes are tenant-qualified and
  durable. Manual retry refuses unresolved ambiguity.
- Provider-pull capabilities are job scoped and short lived; direct-upload
  adapters use an internal authenticated stream. URLs, tokens, and storage keys
  are not persisted in Post/workflow state or logged.

## Commands and unedited results

```text
> pnpm exec jest --selectProjects unit --runInBand --runTestsByPath <20 Stage 6 spec paths>
Running one project: unit

Test Suites: 20 passed, 20 total
Tests:       150 passed, 150 total
Snapshots:   0 total
Time:        8.082 s, estimated 23 s
```

```text
> pnpm exec jest --selectProjects integration --runInBand --runTestsByPath test/integration/bulk.scheduler.execution.int.spec.ts test/integration/bulk.scheduler.upload.int.spec.ts test/integration/calendar.reservation.int.spec.ts test/integration/calendar.writer.cutover.int.spec.ts
Running one project: integration
PASS integration test/integration/bulk.scheduler.upload.int.spec.ts
PASS integration test/integration/calendar.writer.cutover.int.spec.ts
PASS integration test/integration/bulk.scheduler.execution.int.spec.ts
PASS integration test/integration/calendar.reservation.int.spec.ts

Test Suites: 4 passed, 4 total
Tests:       23 passed, 23 total
Snapshots:   0 total
Time:        9.121 s, estimated 32 s
```

The integration gate uses real PostgreSQL, local private storage, and actual
FFmpeg. Its cases cover out-of-order/missing chunks, valid plus corrupt neighbor,
real WebM-to-H.264 normalization, duplicate quarantine, upload idempotency
drift, tenant-qualified FKs, disjoint claims, accepted-then-timeout with one
mutation attempt, cancellation serialization, atomic pinning, and idempotent
manual retry with the ambiguity guard.

```text
> pnpm exec jest --selectProjects unit --runInBand
Running one project: unit

Test Suites: 100 passed, 100 total
Tests:       705 passed, 705 total
Snapshots:   0 total
Time:        73.955 s
Ran all test suites.
```

```text
> pnpm exec tsc -p apps/backend/tsconfig.json --noEmit --pretty false
exit=0
> pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --pretty false
exit=0
> pnpm exec tsc -p apps/orchestrator/tsconfig.json --noEmit --pretty false
exit=0
> pnpm exec eslint <Stage 6 paths> --quiet
exit=0
```

```text
> pnpm run verify:architecture
> node scripts/generate-bulk-scheduler-capabilities.mjs --check
> node scripts/verify-calendar-writers.cjs
{"ok":true,"guard":"calendar-writer-architecture","approvedPublishDateWriters":["libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts"],"approvedPostRetirementWriters":["libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts","libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts","libraries/nestjs-libraries/src/database/prisma/organizations/org-data.service.ts","libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.repository.ts"]}
```

The first architecture-guard run rejected both Stage 6 Post retirements because
the new writer had not been explicitly reviewed. It was not bypassed. The file
was added to the narrow allowlist only after confirming both paths call
`cancelCalendarReservationsInTransaction` in the same transaction. Two guard
tests now reject removal of that primitive and permit the reviewed pattern.

```text
> pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
The schema at libraries\nestjs-libraries\src\database\prisma\schema.prisma is valid 🚀

> pnpm exec prisma migrate status --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
27 migrations found in prisma/migrations
Database schema is up to date!
```

```text
> $env:VERIFY_MIGRATION_TABLES='BulkCampaignJob,BulkUploadPart,BulkUploadSession,PublishingAttempt'; $env:VERIFY_LATEST_MIGRATION='20260813042000_bulk_upload_retry_fields'; node scripts/verify-fresh-migrations.cjs
27 migrations found in prisma/migrations
Applying migration `20260813030000_bulk_campaign_execution`
Applying migration `20260813031000_bulk_campaign_job_optional_slots`
Applying migration `20260813032000_calendar_campaign_handoff`
Applying migration `20260813033000_bulk_campaign_pause_origin`
Applying migration `20260813040000_bulk_resumable_uploads`
Applying migration `20260813041000_bulk_upload_retries`
Applying migration `20260813042000_bulk_upload_retry_fields`
All migrations have been successfully applied.
FRESH_MIGRATION_INSPECTION={"database":"publishly_migration_verify_1786609521833_9ce553","tables":["BulkCampaignJob","BulkUploadPart","BulkUploadSession","PublishingAttempt"],"constraintNames":["BulkCampaignJob_active_claim","BulkCampaignJob_active_has_slot","BulkCampaignJob_asset_org_fkey","BulkCampaignJob_campaign_org_fkey","BulkCampaignJob_claim_pair","BulkCampaignJob_failure_classified","BulkCampaignJob_integration_org_fkey","BulkCampaignJob_link_order","BulkCampaignJob_org_fkey","BulkCampaignJob_outcome_nonempty","BulkCampaignJob_pkey","BulkCampaignJob_positive_numbers","BulkCampaignJob_post_org_fkey","BulkCampaignJob_publishing_org_fkey","BulkCampaignJob_reservation_org_fkey","BulkCampaignJob_slot_tuple","BulkCampaignJob_terminal_times","BulkUploadPart_pkey","BulkUploadPart_session_org_fkey","BulkUploadPart_values","BulkUploadSession_asset_org_fkey","BulkUploadSession_campaign_org_fkey","BulkUploadSession_claim_pair","BulkUploadSession_failure_triple","BulkUploadSession_org_fkey","BulkUploadSession_pkey","BulkUploadSession_ready_asset","BulkUploadSession_sizes","BulkUploadSession_strings","BulkUploadSession_terminal_classified","PublishingAttempt_completion","PublishingAttempt_failure_triple","PublishingAttempt_job_org_fkey","PublishingAttempt_keys_nonempty","PublishingAttempt_org_fkey","PublishingAttempt_pkey","PublishingAttempt_positive_attempt","PublishingAttempt_terminal_classified"],"tokenColumns":[{"table_name":"ProviderMediaGrant","column_name":"tokenHash"}],"latestMigration":{"migration_name":"20260813042000_bulk_upload_retry_fields","finished":true}}
DISPOSABLE_DATABASE_DROPPED=publishly_migration_verify_1786609521833_9ce553
```

## Capability state

The generated matrix contains nine exact video tuples. All nine have
`certificationStatus=not_run` and `defaultEligible=false`; therefore all are
customer-disabled. Instagram professional Reel video is the only row with
implemented private transport, live confirmation, and explicit ambiguity
recovery, so it is the only Stage 8 canary candidate. Provider mocks do not
alter this state.

## Content-addressed checkpoint

The pre-existing worktree contains unrelated user changes, so a broad commit,
reset, or checkout would be unsafe. The Stage 6 checkpoint is the tested files
plus these representative SHA-256 identities:

```text
6e873a930779ea8896567f78620d51f62dbc5c6c90e27bce60cd54907e11a792  DECISIONS.md
83fc38996e0cb30a616e6338626f387443717fd10fc8a814ec277151105d0df8  data/bulk-scheduler-capabilities.json
dee99bfd3c266efb63822bfcc525c1d7268ac2c5804ce3c37110141f11627268  apps/backend/src/api/routes/bulk-import.controller.ts
1ff61e4db77029af97f92a22c505cd5477afcd4caea0f99fbf70d2217b90ce48  apps/frontend/src/components/bulk-scheduler/bulk-scheduler.component.tsx
006cf30ba054c1177d9958a8def1292b38ed19d566192c1f8ccb983e85db505c  apps/orchestrator/src/activities/post.activity.ts
c21d0cff4a4f9b1995ad3dcb625f9f6af604f61d135f4f13f3561635aa4e06ba  apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.9.ts
68c6d020b74546b34068e2a6f9169d977ac7953687035c886cbf4394b1507d1b  libraries/nestjs-libraries/src/database/prisma/schema.prisma
65fc64bbd8da227546c6f47fb01da6e9b0e6f9720ffd9133fcdd34ebb20455c3  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.repository.ts
9924d5d6a9aec21a5c9b85b3bb3106b70e2511109427d0583e2f8cb679fc6849  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.service.ts
780734b133446153ac3ff3e6de75ce105b077277f184ff4d2558939f184165b3  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-upload.repository.ts
ca79b11b3d0986641035c152ddfc615397aea27ee20a8184d5f85dc5e27fffbe  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-upload.service.ts
1e07f5730649242f155c9e71e83735cd87e439cad533e23d46fca4358aaf2f11  libraries/nestjs-libraries/src/database/prisma/publishing-jobs/publishing-attempt.repository.ts
79c295fa8c2431068c25e0acf32e5c8f386726613dc9f110f9381467c88ccd75  libraries/nestjs-libraries/src/upload/private-media.storage.ts
74e05bea42c051f14cd344cc8b7751d843e35b88516d3e497b40b13577fc70b4  test/integration/bulk.scheduler.execution.int.spec.ts
c4e1b027e526282e850ee1df9a0f8e6dc6c1c026c2db28dc30f6798ff4680b9b  test/integration/bulk.scheduler.upload.int.spec.ts
49b56aec04678a1e6b6223d0cfea3e9df3bb6a4358f4c9669f7c0aa0e7f0efb8  libraries/nestjs-libraries/src/database/prisma/migrations/20260813030000_bulk_campaign_execution/migration.sql
41966c2d662dc376640843165459c864066cf9a40edf4774ccfd63f1b46a9041  libraries/nestjs-libraries/src/database/prisma/migrations/20260813040000_bulk_resumable_uploads/migration.sql
4b79e9607f49add41b64dfa8ddae78063cd6f6f791daab554aab025dcc9268d9  libraries/nestjs-libraries/src/database/prisma/migrations/20260813042000_bulk_upload_retry_fields/migration.sql
```

Rollback: set `BULK_SCHEDULER_KILL_ALL=true`, disable the materializer, pause
campaigns, revoke provider-media grants, and retain all additive ledgers. Use
the calendar kill switch for a reservation incident. Never route around V109 or
the reservation ledger; schema rollback is a reviewed forward migration.
