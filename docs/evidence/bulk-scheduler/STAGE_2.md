# Stage 2 evidence — campaign intent and issue ledgers

Recorded: 2026-08-12 (America/New_York)

Decisions: `DECISIONS.md`, ADR-027A and ADR-027B. The stage also follows the local-only
checkpoint constraint in ADR-026.

## Delivered contract

- Additive `BulkCampaign`, append-only `BulkCampaignIntent`, and durable
  `BulkCampaignIssue` tables.
- Composite `(campaignId, organizationId)` foreign keys on both ledgers.
- Required issue class, existing failure taxonomy, registry-backed code,
  non-empty reason, typed optional subject, retryability, and coherent durable
  resolution.
- Transactional campaign/revision/issue audit events; deterministic audit IDs
  and request identities make replays idempotent.
- Authenticated create/get/revise/list/intent-history/issue-list/resolve API with
  bounded collection-specific cursors.
- Public destination creation is generated from and fail-closed by the Stage 1
  exact tuple matrix. No uncertified combination can create executable intent.
- Structured logs and Sentry counters for creation/replay, blocked
  destinations, intent edits, issue recording, and issue resolution.
- Operator alerts and forward-only rollback guidance in `docs/OPERATIONS.md`.

## Commands and unedited results

```text
> node node_modules/prisma/build/index.js format --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Formatted libraries\nestjs-libraries\src\database\prisma\schema.prisma in 93ms 🚀

> node node_modules/prisma/build/index.js validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
The schema at libraries/nestjs-libraries/src/database/prisma/schema.prisma is valid 🚀

> node node_modules/prisma/build/index.js generate --no-engine --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
✔ Generated Prisma Client (v6.5.0, engine=none) to .\node_modules\@prisma\client in 1.13s

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath libraries/helpers/src/bulk-scheduler/campaign.contract.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.spec.ts
Running one project: unit
PASS unit libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.spec.ts
PASS unit libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.spec.ts (21.717 s)
PASS unit libraries/helpers/src/bulk-scheduler/campaign.contract.spec.ts

Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
Snapshots:   0 total
Time:        23.656 s, estimated 37 s
Ran all test suites within paths "libraries/helpers/src/bulk-scheduler/campaign.contract.spec.ts", "libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.spec.ts", "libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.spec.ts".

> node node_modules/eslint/bin/eslint.js libraries/helpers/src/bulk-scheduler/campaign.contract.ts libraries/helpers/src/bulk-scheduler/campaign.contract.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.spec.ts libraries/nestjs-libraries/src/dtos/bulk/create.bulk.campaign.dto.ts apps/backend/src/api/routes/bulk-import.controller.ts --quiet
exit=0

> node node_modules/typescript/bin/tsc --noEmit -p apps/backend/tsconfig.json --pretty false
exit=0

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand
Running one project: unit
Test Suites: 83 passed, 83 total
Tests:       580 passed, 580 total
Snapshots:   0 total
Time:        109.29 s, estimated 273 s
Ran all test suites.

> node node_modules/prisma/build/index.js migrate deploy --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Datasource "db": PostgreSQL database "publishly-db-local", schema "public" at "localhost:5433"

16 migrations found in prisma/migrations

Applying migration `20260812230000_bulk_campaign_ledgers`

The following migration(s) have been applied:

migrations/
  └─ 20260812230000_bulk_campaign_ledgers/
    └─ migration.sql

All migrations have been successfully applied.

> node node_modules/prisma/build/index.js migrate status --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Datasource "db": PostgreSQL database "publishly-db-local", schema "public" at "localhost:5433"

16 migrations found in prisma/migrations

Database schema is up to date!
```

## Fresh-chain migration proof

A uniquely named disposable database on the configured local Postgres host was
created, all 16 migrations were deployed, constraints were inspected through
`pg_constraint`, and the database was dropped in `finally`.

```text
16 migrations found in prisma/migrations
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
All migrations have been successfully applied.
STAGE2_MIGRATION_INSPECTION={"disposableDatabase":"publishly_bulk_stage2_1786591539480","tables":["BulkCampaign","BulkCampaignIntent","BulkCampaignIssue"],"constraints":[{"conname":"BulkCampaignIntent_campaignId_organizationId_fkey","definition":"FOREIGN KEY (\"campaignId\", \"organizationId\") REFERENCES \"BulkCampaign\"(id, \"organizationId\") ON UPDATE CASCADE ON DELETE CASCADE"},{"conname":"BulkCampaignIntent_hash_nonempty","definition":"CHECK ((length(btrim(\"intentHash\")) = 64))"},{"conname":"BulkCampaignIntent_object","definition":"CHECK ((jsonb_typeof(intent) = 'object'::text))"},{"conname":"BulkCampaignIntent_revision_positive","definition":"CHECK ((revision >= 1))"},{"conname":"BulkCampaignIntent_schema_version_positive","definition":"CHECK ((\"schemaVersion\" >= 1))"},{"conname":"BulkCampaignIssue_campaignId_organizationId_fkey","definition":"FOREIGN KEY (\"campaignId\", \"organizationId\") REFERENCES \"BulkCampaign\"(id, \"organizationId\") ON UPDATE CASCADE ON DELETE CASCADE"},{"conname":"BulkCampaignIssue_code_nonempty","definition":"CHECK (((length(btrim(code)) >= 1) AND (length(btrim(code)) <= 120)))"},{"conname":"BulkCampaignIssue_event_key_nonempty","definition":"CHECK (((length(btrim(\"eventKey\")) >= 1) AND (length(btrim(\"eventKey\")) <= 240)))"},{"conname":"BulkCampaignIssue_reason_nonempty","definition":"CHECK (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 2000)))"},{"conname":"BulkCampaignIssue_resolution_coherent","definition":"CHECK ((((state = 'open'::\"BulkCampaignIssueState\") AND (\"resolvedAt\" IS NULL) AND (\"resolutionCode\" IS NULL)) OR ((state = 'resolved'::\"BulkCampaignIssueState\") AND (\"resolvedAt\" IS NOT NULL) AND ((length(btrim(\"resolutionCode\")) >= 1) AND (length(btrim(\"resolutionCode\")) <= 120)))))"},{"conname":"BulkCampaignIssue_subject_pair","definition":"CHECK ((((\"subjectType\" IS NULL) AND (\"subjectId\" IS NULL)) OR ((\"subjectType\" IS NOT NULL) AND ((length(btrim(\"subjectId\")) >= 1) AND (length(btrim(\"subjectId\")) <= 240)))))"},{"conname":"BulkCampaign_issue_counts_valid","definition":"CHECK (((\"issueCount\" >= 0) AND (\"openIssueCount\" >= 0) AND (\"openIssueCount\" <= \"issueCount\")))"},{"conname":"BulkCampaign_name_nonempty","definition":"CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)))"},{"conname":"BulkCampaign_organizationId_fkey","definition":"FOREIGN KEY (\"organizationId\") REFERENCES \"Organization\"(id) ON UPDATE CASCADE ON DELETE CASCADE"},{"conname":"BulkCampaign_revision_positive","definition":"CHECK ((\"currentRevision\" >= 1))"}],"latestMigration":{"migration_name":"20260812230000_bulk_campaign_ledgers","finished":true}}
DISPOSABLE_DATABASE_DROPPED=publishly_bulk_stage2_1786591539480
```

## Failures found and fixed

1. Normal Prisma generation could not replace a Windows query-engine DLL held
   by the already-running local app. The exact error was:

   ```text
   EPERM: operation not permitted, rename 'C:\Users\Phliq\Desktop\publishly\node_modules\.prisma\client\query_engine-windows.dll.node.tmp26016' -> 'C:\Users\Phliq\Desktop\publishly\node_modules\.prisma\client\query_engine-windows.dll.node'
   ```

   `prisma generate --no-engine` regenerated the types without interrupting the
   site; the existing compatible engine remains installed.

2. The first compiler run exposed boolean-union narrowing under the repository
   TypeScript configuration:

   ```text
   bulk-campaign.service.ts(166,26): error TS2339: Property 'code' does not exist on type 'BulkCampaignIntentValidation'.
   bulk-campaign.service.ts(167,28): error TS2339: Property 'reason' does not exist on type 'BulkCampaignIntentValidation'.
   ```

   The guard now uses the explicit `validation.valid === false` discriminant;
   the compiler then passed.

## Content-addressed checkpoint

The worktree was already broadly dirty, so the checkpoint remains a scoped
SHA-256 manifest rather than a commit that would capture unrelated user work.

```text
070a50d113e296a452430d9c255e55288d719ac31b3cd792ba5439bfade2c59b  DECISIONS.md
4f07a79057f487d9c0a086aab2924f363c8abfc67cdb85f74ef8bbc319ec6507  apps/backend/src/api/routes/bulk-import.controller.ts
cf051dd8c4d8e5f8f442a01f20dcaa8cc1b8f5042ddaa144fe691397bb443bef  libraries/helpers/src/bulk-scheduler/campaign.contract.ts
f54bf18eacc0258d138750362a6136c8b68912524f198eaef6f249412a7a20a7  libraries/helpers/src/bulk-scheduler/campaign.contract.spec.ts
02689e0d12bf30d7d7f88b7c67885492e5c692881cdba620c1b8423c1249053c  libraries/nestjs-libraries/src/database/prisma/schema.prisma
be6ac49a2ce8178b2082f3dda94cf440399d5654b5421bf2f80399b30584dc3e  libraries/nestjs-libraries/src/database/prisma/migrations/20260812230000_bulk_campaign_ledgers/migration.sql
ede25c27d249f0810ffda4992ec8800c13b5562823e8473854d89a20c58468fe  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.ts
2fb739403c8804be9a5007c458a0f163f7b4b21ee9bcd25042afdb1cc064784a  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.repository.spec.ts
c4bf5421349ed4d13ad196fe259731e19d9f33451e9aaa5607959b36e132d98b  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.ts
6067baab6f8a459f2db56220ce1891ec5ad43a7b82f194046335a3ccc6c39241  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign.service.spec.ts
56189cc4e10fd60f003a14898890596a6fdbbb7544ed66436308fe3b634a2c41  libraries/nestjs-libraries/src/database/prisma/database.module.ts
4b449913e9807e6c8029c4477130041545ebfa6246aaaaec9e775e687a6c4540  libraries/nestjs-libraries/src/dtos/bulk/create.bulk.campaign.dto.ts
3387fa1c0312b90d2891e6b3a74501416ced53c2c5abb02458ad4621b1eecbdc  docs/BULK_SCHEDULER_API.md
fcf4f2995936be4bae18633ee729433067ed35046e9d040151c7509837db5ea7  docs/OPERATIONS.md
```

Rollback: set `BULK_SCHEDULER_KILL_ALL=true`, stop future materializers, and
revert application routes/services if necessary. Keep the additive ledger
tables during an incident; remove them only through a reviewed forward
migration after backup/retention review.
