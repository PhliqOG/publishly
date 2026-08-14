# Stage 5 evidence — all calendar writers use the reservation ledger

Recorded: 2026-08-13 (America/New_York)

Decision: `DECISIONS.md`, ADR-030. Stage 5 moves every discovered production
calendar writer behind the Stage 4 reservation ledger, proves shadow-to-authority
cutover tenant by tenant, and installs an architecture guard that fails CI on a
new bypass. It does not create or dispatch Bulk Scheduler publish jobs; that is
Stage 6.

## Delivered contract

- `PostCalendarWriterService` is the create/update/reschedule/cancel gate used
  by `PostsService`. A stable Post ID owns a pre-materialization hold; the hold
  commits before publishing-job creation or V109 workflow dispatch.
- Shadow mode mirrors every post mutation before dispatch. Bounded authority
  promotion holds an exclusive tenant cutover lock and requires an exact shadow
  row for the same tenant/Post/connection/UTC instant. Missing proof is a
  durable `calendar_writer_shadow_missing` conflict and cannot activate.
- Authoritative reschedule changes the Post and its reservation atomically
  after owner and slot locking. A conflict leaves the Post unchanged and writes
  a durable `calendar_slot_conflict` attempt. Abort/retry and post-insert crash
  recovery preserve idempotency and immutable `ownerRevision` history.
- Composer retirement, connection replacement/deletion, workspace erasure,
  and Meta erasure use the same tenant-scoped transaction primitive. The source
  mutation rolls back if the ledger cannot record the retirement. Published or
  pinned history is retained.
- Schedule intent stores UTC plus local wall time, IANA timezone, offset, and
  DST fold. Callers without historical local intent are explicitly marked UTC.
- `CALENDAR_RESERVATION_ENFORCED_TENANTS` supports bounded tenant rollout.
  Global enforcement and kill switches remain permanent.
- `scripts/verify-calendar-writers.cjs` AST-scans production TypeScript. It
  rejects direct `publishDate` mutations, direct Post retirements, repository
  bypasses, and retirement files that omit the shared ledger primitive. CI runs
  it together with the capability-matrix drift guard.

## Commands and unedited results

```text
> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath libraries/helpers/src/bulk-scheduler/calendar-writer-architecture.spec.ts
Running one project: unit
PASS unit libraries/helpers/src/bulk-scheduler/calendar-writer-architecture.spec.ts

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        1.388 s
```

```text
> node node_modules/jest/bin/jest.js --selectProjects integration --runInBand --runTestsByPath test/integration/calendar.reservation.int.spec.ts test/integration/calendar.writer.cutover.int.spec.ts
Running one project: integration
PASS integration test/integration/calendar.writer.cutover.int.spec.ts (5.738 s)
PASS integration test/integration/calendar.reservation.int.spec.ts

Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        7.275 s, estimated 9 s
```

The Stage 5 suite's eight real-PostgreSQL cases passed: shadow-before-dispatch,
bounded promotion/hold/attach, unchanged conflicted reschedule, legacy-conflict
resolution, missing-shadow fail-closed/repair, expired-hold crash repair,
abort/retry owner revision, and atomic reschedule/cancel history.

```text
> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand
Running one project: unit

Test Suites: 93 passed, 93 total
Tests:       671 passed, 671 total
Snapshots:   0 total
Time:        32.772 s, estimated 121 s
Ran all test suites.
```

```text
> node node_modules/typescript/bin/tsc --noEmit -p apps/backend/tsconfig.json --pretty false
exit=0

> node node_modules/eslint/bin/eslint.js <Stage 5 TypeScript files> --quiet
exit=0
```

```text
> pnpm run verify:architecture
> pnpm run verify:bulk-capabilities && pnpm run verify:calendar-writers
> node scripts/generate-bulk-scheduler-capabilities.mjs --check
> node scripts/verify-calendar-writers.cjs
{"ok":true,"guard":"calendar-writer-architecture","approvedPublishDateWriters":["libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts"],"approvedPostRetirementWriters":["libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts","libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts","libraries/nestjs-libraries/src/database/prisma/organizations/org-data.service.ts","libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.ts"]}
```

```text
> node node_modules/prisma/build/index.js format --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Formatted libraries\nestjs-libraries\src\database\prisma\schema.prisma in 115ms 🚀

> node node_modules/prisma/build/index.js validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
The schema at libraries\nestjs-libraries\src\database\prisma\schema.prisma is valid 🚀

> node node_modules/prisma/build/index.js migrate status --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
20 migrations found in prisma/migrations
Database schema is up to date!
```

## Fresh-chain migration proof

```text
> $env:VERIFY_MIGRATION_TABLES='CalendarReservation,CalendarReservationBackfill'; $env:VERIFY_LATEST_MIGRATION='20260813023000_calendar_prepost_terminal_attempts'; node scripts/verify-fresh-migrations.cjs
20 migrations found in prisma/migrations
Applying migration `20260813020000_calendar_writer_cutover`
Applying migration `20260813023000_calendar_prepost_terminal_attempts`
All migrations have been successfully applied.
FRESH_MIGRATION_INSPECTION={"database":"publishly_migration_verify_1786599894033_2340f3","tables":["CalendarReservation","CalendarReservationBackfill"],"constraintNames":["CalendarReservation_campaignId_organizationId_fkey","CalendarReservation_idempotency_nonempty","CalendarReservation_integrationId_organizationId_fkey","CalendarReservation_local_intent_valid","CalendarReservation_organizationId_fkey","CalendarReservation_outcome_nonempty","CalendarReservation_owner_link","CalendarReservation_owner_nonempty","CalendarReservation_owner_revision_positive","CalendarReservation_pkey","CalendarReservation_postId_organizationId_fkey","CalendarReservation_request_hash","CalendarReservation_revision_positive","CalendarReservation_shadow_not_held","CalendarReservation_source_nonempty","CalendarReservation_state_timestamps","CalendarReservationBackfill_authority_count_valid","CalendarReservationBackfill_authority_cursor_pair","CalendarReservationBackfill_counts_valid","CalendarReservationBackfill_cursor_pair","CalendarReservationBackfill_organizationId_fkey","CalendarReservationBackfill_outcome_nonempty","CalendarReservationBackfill_pkey","CalendarReservationBackfill_source_nonempty","CalendarReservationBackfill_state_timestamps","CalendarReservationBackfill_watermark_pair"],"tokenColumns":[{"table_name":"ProviderMediaGrant","column_name":"tokenHash"}],"latestMigration":{"migration_name":"20260813023000_calendar_prepost_terminal_attempts","finished":true}}
DISPOSABLE_DATABASE_DROPPED=publishly_migration_verify_1786599894033_2340f3
```

## Failures found and fixed

1. PostgreSQL truncated two migration index names to the same 63-byte name.
   Both were shortened; the failed transactional migration was marked rolled
   back and redeployed successfully.
2. The initial owner-link constraint rejected a valid terminal pre-Post abort.
   The follow-up migration keeps `COMMITTED` linked to a Post while allowing
   terminal attempts without one; the abort/retry integration case now passes.
3. Authority promotion initially had a UTC fallback when exact shadow proof was
   absent. It now creates `calendar_writer_shadow_missing`, refuses activation,
   and has a fail-closed repair test.
4. The architecture test used CommonJS imports rejected by repository lint.
   It now uses typed ES imports and all six guard cases pass.
5. The first full unit run exposed the installed ESM-only `uuid` package through
   `PostsService`. The two touched Post writer files now use Node's
   `crypto.randomUUID`; the failing seven-case suite and then all 671 unit tests
   pass.

## Content-addressed checkpoint

The worktree contained unrelated user changes before this stage, so no broad
commit or reset was safe. These hashes are the scoped, reproducible checkpoint:

```text
70a0465df0e01b35a069cad51d570de31e9129b6d5ca909c6ddac4ab56ebc106  .env.example
7035a039bd81c2412a4b9dd7a17c4d009f5726caa1d37f0e68f69d047c29083b  .env.production.example
4fa36bab8d7342a3d5cfcc1c2458f3991ded53707be84bca2753507c509a4e92  .github/workflows/build.yml
0cc32a497135961259e36cc20de6db79a6832674201396c42e589f0379ceb3eb  DECISIONS.md
040ea28d1697a9f0ed846b7056965738a76e150b29027170abf8979badea4f5c  docs/API.md
800902a0014d0e67aeb3f8c061c6f15576e606549d973c4818cf734d7a6ddb00  docs/CALENDAR_RESERVATION_ROLLOUT.md
d0faf5cab71b540c3688aa1e43844bf4b519c141d79706abc5343f67c2effebb  docs/OPERATIONS.md
55c9b226a22e39ebf665ac886a805ce1b8c6c4175e2edf5289a332f728061873  package.json
40ae8f29b8970d0a6b2fc8c996f4ca4f459611ff4299ee6fb0dea0a71c920d11  apps/backend/src/api/api.module.ts
cca493674758df996189c29e632f67bf74c3f41614b566ba2523f435dd5048a4  apps/backend/src/api/routes/calendar-reservations.controller.ts
54163140ec84f9f6ac5a952acf8f36da94a0be4f772789427b5ec17eaac72101  libraries/helpers/src/bulk-scheduler/calendar-reservation.contract.ts
ae791b84f73060d52c4aea25414679f064282569a32fced11ff6bcc515d0ad1e  libraries/helpers/src/bulk-scheduler/calendar-writer-architecture.spec.ts
d6e86aa6f32df24c3a4c3deb3f2d85bb66dd643a4c4918b0542190eb65089c7f  libraries/nestjs-libraries/src/dtos/posts/create.post.dto.ts
11bfa60ca0b0c013a2b3ced48ee1122d64b5659cbb4c13afe3c68e68c1403e29  libraries/nestjs-libraries/src/database/prisma/schema.prisma
25053730947bcc179b739e9ee8873d16ad7bafb1a6cdfed004e7588311edef35  libraries/nestjs-libraries/src/database/prisma/database.module.ts
daf8136ad03dcf313144481e2b2dda3e16e85eaacc4e2d2d8743090868709c82  libraries/nestjs-libraries/src/database/prisma/migrations/20260813020000_calendar_writer_cutover/migration.sql
8991d9c963dc25c970126857d94059a31fcd1f979617d54244ed8a6fbcd7905a  libraries/nestjs-libraries/src/database/prisma/migrations/20260813023000_calendar_prepost_terminal_attempts/migration.sql
7249ea6634db95faa538c5045f19955458f898cf306a7a3e326494fdbef687fd  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts
a9c2ec7e44cdfe5a060a6ea0e0264973e939d5056a54f5833c21369679bb35c5  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.service.ts
6d8a8a3cbfe69ab7e7eda6fe927a5dcf729d9dc2743047a51b4d6cdeb35acb21  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/post-calendar-writer.service.ts
63ad80f0940d723b88def6b914b2713cc191b66f84d41dc18714aa78895b994f  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/post-calendar-writer.service.spec.ts
8ec92c746d3e950036b78b3de42fede8b7055e41b321562585428cfaa6637bda  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.mutation.ts
6c864c0365c019ed4e11634a949f85f6cd502aecf2a4cc71b063a7bfb7e94760  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.mutation.spec.ts
b09611c3bf92ffea80ea58174d71c902ef1a1e8e8b72a5bc04b8e3786fd931fc  libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
2bbd582d13a229631301853b2983bde1b85bf73f1b715277ba4bd10d182a8dc7  libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts
7fd6dd634fca7d3a7eb0bc18a45fceddbb1cd00ff4bd50d5c2024936517ea9d3  libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts
cda4d569e15974e909851862f759926a73fe916a366847189d09e05f4976e2ff  libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.deletion.spec.ts
5209a15d0fed9da01eb91134131906c34ccccf2d0de83231b2c876151b95574c  libraries/nestjs-libraries/src/database/prisma/organizations/org-data.service.ts
2f829ed2bc5ebb7add0f214f977666e84143e2d5a4e684844817a056af19494d  libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.ts
ef517e23b66ad4aacde1dea90a2ccccc5f751ec1acc2080073a33119f80868ac  libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.spec.ts
b73638ea10c45a20b0ae7751ece45fbb44f2cbdf6d670c70333a4604739ca65e  scripts/verify-calendar-writers.cjs
b6dcce645af54a306612bee5b435477084dea36783ea01f1a2f8467350e04593  scripts/verify-calendar-writers.d.cts
e27d6e43cb183efb8700f4f67cdf5372b9fb6bc2f25714d3b8fe3f19fbc2738f  test/integration/calendar.writer.cutover.int.spec.ts
```

Rollback: remove affected tenant IDs from
`CALENDAR_RESERVATION_ENFORCED_TENANTS` or set
`CALENDAR_RESERVATION_ENFORCEMENT=false`. For a ledger incident also set
`CALENDAR_RESERVATION_KILL_ALL=true`; writers fail classified and never bypass
the ledger. Pause materializers, retain additive tables and audit rows, and use
a reviewed forward migration for any later schema removal.
