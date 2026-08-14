# Stage 3 evidence — private provider media transport

Recorded: 2026-08-13 (America/New_York)

Decision: `DECISIONS.md`, ADR-028. The worktree was already broadly dirty, so
the clean checkpoint is a scoped content-addressed manifest and does not commit
or absorb unrelated user files.

## Delivered contract

- Private MP4 objects use a separate local root or private S3/R2 bucket and are
  never returned as storage URLs.
- `BulkAsset`, campaign/job asset links, grants, and fetch events have
  tenant-composite foreign keys and constrained state.
- Provider-pull access is random, hashed-at-rest, job/asset scoped, expiring,
  revocable, range-aware, and matrix-configured per exact tuple. Direct-upload
  rows open the same private bytes only after a tenant/job/asset lookup.
- Known successful, rejected, and failed fetches are durable. Unknown or
  malformed capabilities are redacted and classified without fabricating a
  tenant ledger row.
- Backend and production preflight fail closed on an invalid provider origin,
  public/private bucket reuse, missing private credentials, or canary mode
  without an exact tuple list.
- Application logging redacts provider capabilities. The deployment runbook
  requires matching edge/proxy redaction and disabled caching.
- All nine authored video rows now have implemented private transport, but all
  remain `certificationStatus:not_run`, `defaultEligible:false`, and therefore
  customer-disabled.

## Commands and unedited results

```text
> node node_modules/prisma/build/index.js format --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Formatted libraries\nestjs-libraries\src\database\prisma\schema.prisma in 107ms 🚀

> node node_modules/prisma/build/index.js validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
The schema at libraries\nestjs-libraries\src\database\prisma\schema.prisma is valid 🚀

> node node_modules/prisma/build/index.js generate --no-engine --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
✔ Generated Prisma Client (v6.5.0, engine=none) to .\node_modules\@prisma\client in 946ms

> node scripts/generate-bulk-scheduler-capabilities.mjs --check
exit=0

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath libraries/helpers/src/configuration/production.env.preflight.spec.ts libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts libraries/helpers/src/bulk-scheduler/provider-media.contract.spec.ts libraries/nestjs-libraries/src/upload/private-media.storage.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.repository.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.service.spec.ts apps/backend/src/api/routes/provider-media.controller.spec.ts libraries/nestjs-libraries/src/reliability/post.failure.spec.ts
Running one project: unit
PASS unit libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.service.spec.ts
PASS unit apps/backend/src/api/routes/provider-media.controller.spec.ts
PASS unit libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.repository.spec.ts
PASS unit libraries/nestjs-libraries/src/upload/private-media.storage.spec.ts
PASS unit libraries/helpers/src/configuration/production.env.preflight.spec.ts
PASS unit libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts
PASS unit libraries/nestjs-libraries/src/reliability/post.failure.spec.ts
PASS unit libraries/helpers/src/bulk-scheduler/provider-media.contract.spec.ts

Test Suites: 8 passed, 8 total
Tests:       89 passed, 89 total
Snapshots:   0 total
Time:        4.08 s

> node node_modules/eslint/bin/eslint.js <Stage 3 TypeScript files> --quiet
exit=0

> node node_modules/typescript/bin/tsc --noEmit -p apps/backend/tsconfig.json --pretty false
exit=0

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand
Running one project: unit
Test Suites: 88 passed, 88 total
Tests:       626 passed, 626 total
Snapshots:   0 total
Time:        105.504 s, estimated 113 s
Ran all test suites.
```

## Fresh-chain and deployed migration proof

The verifier refuses non-local PostgreSQL, creates a uniquely named database,
deploys the whole chain, inspects the requested tables/constraints, and drops
only the safety-prefixed database in `finally`.

```text
> $env:VERIFY_MIGRATION_TABLES='BulkAsset,BulkCampaignAsset,BulkPublishingJobAsset,ProviderMediaGrant,ProviderMediaFetchEvent'; $env:VERIFY_LATEST_MIGRATION='20260812233000_private_provider_media'; node scripts/verify-fresh-migrations.cjs
17 migrations found in prisma/migrations
Applying migration `20260809000000_publishly_baseline`
Applying migration `20260809010000_inbox_workflow_state`
Applying migration `20260809020000_media_metadata`
Applying migration `20260809030000_publishing_jobs`
Applying migration `20260809040000_webhook_delivery_observability`
Applying migration `20260809050000_meta_data_deletion`
Applying migration `20260810010000_failure_taxonomy`
Applying migration `20260810020000_delivery_receipts`
Applying migration `20260810030000_idempotent_retries`
Applying migration `20260810040000_connection_health`
Applying migration `20260810050000_fleet_health_dashboard`
Applying migration `20260810060000_fleet_primitives`
Applying migration `20260810070000_platform_truth`
Applying migration `20260810080000_public_status`
Applying migration `20260810090000_successful_post_billing`
Applying migration `20260812230000_bulk_campaign_ledgers`
Applying migration `20260812233000_private_provider_media`
All migrations have been successfully applied.
FRESH_MIGRATION_INSPECTION={"database":"publishly_migration_verify_1786594174977_7ff512","tables":["BulkAsset","BulkCampaignAsset","BulkPublishingJobAsset","ProviderMediaFetchEvent","ProviderMediaGrant"],"constraintNames":["BulkAsset_organizationId_fkey","BulkAsset_original_name_nonempty","BulkAsset_pkey","BulkAsset_sha256_valid","BulkAsset_size_valid","BulkAsset_state_timestamps","BulkAsset_storage_key_nonempty","BulkAsset_video_mime","BulkCampaignAsset_assetId_organizationId_fkey","BulkCampaignAsset_campaignId_organizationId_fkey","BulkCampaignAsset_pkey","BulkCampaignAsset_position_nonnegative","BulkPublishingJobAsset_assetId_organizationId_fkey","BulkPublishingJobAsset_ordinal_nonnegative","BulkPublishingJobAsset_pkey","BulkPublishingJobAsset_publishingJobId_organizationId_fkey","ProviderMediaFetchEvent_bytes_valid","ProviderMediaFetchEvent_code_nonempty","ProviderMediaFetchEvent_completion_coherent","ProviderMediaFetchEvent_grantId_organizationId_fkey","ProviderMediaFetchEvent_organizationId_fkey","ProviderMediaFetchEvent_pkey","ProviderMediaFetchEvent_range_bounded","ProviderMediaFetchEvent_reason_nonempty","ProviderMediaFetchEvent_status_valid","ProviderMediaGrant_expiry_valid","ProviderMediaGrant_fetches_valid","ProviderMediaGrant_job_asset_fkey","ProviderMediaGrant_organizationId_fkey","ProviderMediaGrant_pkey","ProviderMediaGrant_revocation_coherent","ProviderMediaGrant_token_hash","ProviderMediaGrant_tuple_nonempty"],"tokenColumns":[{"table_name":"ProviderMediaGrant","column_name":"tokenHash"}],"latestMigration":{"migration_name":"20260812233000_private_provider_media","finished":true}}
DISPOSABLE_DATABASE_DROPPED=publishly_migration_verify_1786594174977_7ff512

> node node_modules/prisma/build/index.js migrate deploy --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Applying migration `20260812233000_private_provider_media`
All migrations have been successfully applied.

> node node_modules/prisma/build/index.js migrate status --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
17 migrations found in prisma/migrations
Database schema is up to date!
```

## Failures found and fixed

1. An initial campaign-asset replay used the tenant-free compound primary key
   in an upsert update. It now creates first and performs only a tenant-scoped
   replay lookup; job-asset replay uses the tenant-qualified unique key.
2. The first targeted command misspelled `capability.matrix.spec.ts` as
   `capability-matrix.spec.ts` (one requested suite failed to open while the
   other seven passed). The corrected run above executes all eight suites.
3. Backend compilation found an ES target incompatibility (`String.replaceAll`)
   and an implicit-null test property. Both were corrected; the compiler and
   full suite then passed.
4. The generated capability page did not expose provider fetch semantics. It
   now derives TTL, repeat-fetch behavior, and HEAD/Range support from the same
   authored matrix.

## Content-addressed checkpoint

```text
eafa2dfc0645c8ef1da874ee17adf69a2f83a640ce37f743e1969aeb267a0c50  .env.example
6206a9864ff22d6f910455535ca224883facdd2ffad295c21f737d327e72517b  .env.production.example
b7becb696af07b1968d13f1fa2a93795c1ae5ac07c08a34d82978accd444abed  DECISIONS.md
5eac34f00a4734e9279f934c073e19d9f3bd30505de44846c70a4dbad246e25a  apps/backend/src/api/api.module.ts
92cc1d1105ad19614a5df7d6a45fcabaa923c229eaaf869ed1204da84d6cfcca  apps/backend/src/api/routes/provider-media.controller.ts
39cf6d8dda0cd2ab3177f7ee482faf94304952fe695dc9b59276d19a45844aeb  apps/backend/src/api/routes/provider-media.controller.spec.ts
b62e5272fc3834afffddc601c5ff821813267ea52c7d66366e7a93f94547366f  apps/backend/src/main.ts
cfe72e2d4b4bdfd89e942243509442ea710a73756fa0fc8722f0a6d6d5be28b9  data/bulk-scheduler-capabilities.json
d35e99623f8d943a313d6fa693d69e56115ff26a3fa0f7d4385fcd286c79cec8  docs/BULK_SCHEDULER_CAPABILITIES.md
3a8e65348b51143e9d8d501285bd1f41be3cf289035edf644a983d1cf757f71f  docs/OPERATIONS.md
8035819a86ba2fce61a8e9c6837c800e4d36a55c4136e3fd35c76e9518867d16  docs/PRIVATE_PROVIDER_MEDIA.md
558c2f58bb966683d881d080f32ca6acaf4f6c0ae9f1df2e5dd395594d919dc9  libraries/helpers/src/bulk-scheduler/capability.matrix.ts
01c4f247110518c8b7cd75eb5b4bf8e603e7dd9e5bd7d009372e31c249b649fe  libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts
0e64a7d63193f4db37221c22635368f4dd2a6354a43c2014c5b4cacfdeb1dc5d  libraries/helpers/src/bulk-scheduler/provider-media.contract.ts
05b9041bf9e13523f7a3c6fd72e9e3cbb387f83e0ac4d265e89fb434416dd98c  libraries/helpers/src/bulk-scheduler/provider-media.contract.spec.ts
33b43901f67cc9cdeb2e2d957c3264132f3e29b23384894d12b2718767213aed  libraries/helpers/src/configuration/production.env.preflight.spec.ts
4f849eee032acf8cf13124e2be09fbc015295029c70938fa53c0369a2c6d8072  libraries/nestjs-libraries/src/database/prisma/schema.prisma
581941062b32fdd3a58ba0e4a6fe2db1419c1658ff9c5475bca180ce8abc3588  libraries/nestjs-libraries/src/database/prisma/migrations/20260812233000_private_provider_media/migration.sql
1ef76c56955c1a071220728a526654cc77f535365cbc57406efde04168eb34c5  libraries/nestjs-libraries/src/database/prisma/database.module.ts
0b610be7295994b708573926502d262ebd41e2a80e2f48d369bb2bb7b306ba74  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.repository.ts
0833ed862e0d01b7156eb4148e66966c970ff763085118a87395585def93adb6  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.repository.spec.ts
cdd594effa25432c7860320228d8b0338d4dec4c16be730a38129ac895a872e8  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.service.ts
44eb677ce38150d855552b2100d6a1e657542084847263f8b49239a4735e878e  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.service.spec.ts
8d72f4848d7a48aaf2f6a27f51283719595151ebfb4b49e818ba3ae1f1219db1  libraries/nestjs-libraries/src/reliability/post.failure.ts
91eed80871fdcb5e5c56195eb7bafdf2713b876f86dd74cabc892a12b819d690  libraries/nestjs-libraries/src/reliability/post.failure.spec.ts
7614725e1500964c144c2d9b2ce68ccc8c956c2613c2ec57e995ecd05485606d  libraries/nestjs-libraries/src/upload/private-media.storage.ts
92d7f1c78345e2500f035b77bb131ab41f82cfdd88dc25b84544ca048f49ee21  libraries/nestjs-libraries/src/upload/private-media.storage.spec.ts
9148e14f425d22cf84a1c6902a8683612da2ef91bae8a3ca8e2bad94aff97c44  scripts/generate-bulk-scheduler-capabilities.mjs
d70f7458f4134841ef404ffc9c8003bb57e3768228b6963a1bec59d031049d52  scripts/verify-fresh-migrations.cjs
b20907c50fe5071f62f6082cf124326f3d839b44be1557b646c55fcf8c3c3085  scripts/verify-production-env.cjs
```

Rollback: retain the additive tables, set `BULK_SCHEDULER_KILL_ALL=true`,
pause future campaign dispatch, revoke affected job grants, and revert the
route/service deployment. Do not expose the private bucket or replace this path
with public media during an incident.
