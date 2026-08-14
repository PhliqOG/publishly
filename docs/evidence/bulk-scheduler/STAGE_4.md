# Stage 4 evidence — generic reservation ledger and shadow backfill

Recorded: 2026-08-13 (America/New_York)

Decision: `DECISIONS.md`, ADR-029. This stage adds the shared database ledger,
shadow/backfill/verifier, API reads, rollout controls, and failure handling. It
does not switch legacy writers; that is the ordered Stage 5 cutover.

## Delivered contract

- `CalendarReservation` owns generic post or campaign slots with strict tenant
  keys, UTC plus local timezone/DST intent, pinning, revisions, stable outcome
  code/reason, audit history, and bounded cursors.
- PostgreSQL serializes an exact tenant/account/instant with a two-key advisory
  transaction lock and a partial unique index over authoritative active rows.
  Shadow rows cannot break migration when legacy conflicts already exist.
- Exact idempotency replays; changed intent under the same key is rejected.
  Concurrent losers are inserted as durable `CONFLICTED` rows rather than
  skipped.
- Holds expire under lock. Lifecycle transitions use expected revisions.
  Published/manually pinned slots are immutable to ordinary release/cancel.
- Restartable keyset backfill records a fixed high watermark, excludes child
  posts, uses deterministic rows, classifies duplicate legacy slots, and
  verifies missing/changed/extra/state mismatches. Later-created posts do not
  silently widen the snapshot.
- `CalendarReservationBackfill` makes progress and verification durable. API
  pages and backfill operations are tenant-scoped and permission guarded.
- Global kill, shadow, and enforcement controls are permanent; production
  preflight disallows enforcement with shadow comparison disabled.

## Commands and unedited results

```text
> node node_modules/prisma/build/index.js format --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Formatted libraries\nestjs-libraries\src\database\prisma\schema.prisma in 77ms 🚀

> node node_modules/prisma/build/index.js validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
The schema at libraries\nestjs-libraries\src\database\prisma\schema.prisma is valid 🚀

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath libraries/helpers/src/bulk-scheduler/calendar-reservation.contract.spec.ts libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.service.spec.ts libraries/helpers/src/configuration/production.env.preflight.spec.ts
Running one project: unit
PASS unit libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.service.spec.ts
PASS unit libraries/helpers/src/bulk-scheduler/calendar-reservation.contract.spec.ts
PASS unit libraries/helpers/src/configuration/production.env.preflight.spec.ts

Test Suites: 3 passed, 3 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        3.682 s

> node node_modules/jest/bin/jest.js --selectProjects integration --runInBand --runTestsByPath test/integration/calendar.reservation.int.spec.ts
Running one project: integration
PASS integration test/integration/calendar.reservation.int.spec.ts
  calendar reservation ledger integration
    √ serializes an exact account slot, replays exactly, and persists the loser as conflicted (199 ms)
    √ blocks cross-tenant integration attachment and tenant-scopes reads (52 ms)
    √ uses optimistic transitions and preserves pinned reservations (139 ms)
    √ backfills bounded pages to a fixed watermark and classifies legacy conflicts (241 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        3.87 s, estimated 5 s

> node node_modules/typescript/bin/tsc --noEmit -p apps/backend/tsconfig.json --pretty false
exit=0

> node node_modules/eslint/bin/eslint.js <Stage 4 TypeScript files> --quiet
exit=0

> node scripts/generate-bulk-scheduler-capabilities.mjs --check
exit=0

> node node_modules/prisma/build/index.js migrate status --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from libraries\nestjs-libraries\src\database\prisma\schema.prisma
Datasource "db": PostgreSQL database "publishly-db-local", schema "public" at "localhost:5433"

18 migrations found in prisma/migrations

Database schema is up to date!

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand
Running one project: unit
Test Suites: 90 passed, 90 total
Tests:       647 passed, 647 total
Snapshots:   0 total
Time:        135.633 s
Ran all test suites.
```

## Fresh-chain migration proof

```text
> $env:VERIFY_MIGRATION_TABLES='CalendarReservation,CalendarReservationBackfill'; $env:VERIFY_LATEST_MIGRATION='20260813003000_calendar_reservation_ledger'; node scripts/verify-fresh-migrations.cjs
18 migrations found in prisma/migrations
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
Applying migration `20260813003000_calendar_reservation_ledger`
All migrations have been successfully applied.
FRESH_MIGRATION_INSPECTION={"database":"publishly_migration_verify_1786595075133_473dc7","tables":["CalendarReservation","CalendarReservationBackfill"],"constraintNames":["CalendarReservation_campaignId_organizationId_fkey","CalendarReservation_idempotency_nonempty","CalendarReservation_integrationId_organizationId_fkey","CalendarReservation_local_intent_valid","CalendarReservation_organizationId_fkey","CalendarReservation_outcome_nonempty","CalendarReservation_owner_link","CalendarReservation_owner_nonempty","CalendarReservation_pkey","CalendarReservation_postId_organizationId_fkey","CalendarReservation_request_hash","CalendarReservation_revision_positive","CalendarReservation_shadow_not_held","CalendarReservation_source_nonempty","CalendarReservation_state_timestamps","CalendarReservationBackfill_counts_valid","CalendarReservationBackfill_cursor_pair","CalendarReservationBackfill_organizationId_fkey","CalendarReservationBackfill_outcome_nonempty","CalendarReservationBackfill_pkey","CalendarReservationBackfill_source_nonempty","CalendarReservationBackfill_state_timestamps","CalendarReservationBackfill_watermark_pair"],"tokenColumns":[{"table_name":"ProviderMediaGrant","column_name":"tokenHash"}],"latestMigration":{"migration_name":"20260813003000_calendar_reservation_ledger","finished":true}}
DISPOSABLE_DATABASE_DROPPED=publishly_migration_verify_1786595075133_473dc7
```

## Failures found and fixed

1. The first real-database acquisition run showed Prisma binding both advisory
   key parameters as PostgreSQL `bigint`; the two-argument function accepts
   `integer,integer`. The SQL now casts both inputs to `int`. The rerun proved
   concurrent serialization and a durable loser.
2. The Stage 3 type-only Prisma generation caused the first integration attempt
   to request a `prisma://` engine. A normal generation refreshed the client
   metadata; Windows could not replace the engine DLL held by the running app,
   but the existing same-version DLL remained usable. The rerun exercised the
   real local PostgreSQL successfully. A clean build/CI host will perform the
   normal generation without this development-only file lock.
3. Backend compilation found an implicit `null` type in the UTC backfill helper;
   the return type is now explicit and compilation passes.

## Content-addressed checkpoint

```text
16ab65cc4b735c2738806be08defa9522943e1535665cb392f4569840884d8f8  .env.example
bdb317754b71ea0482005431d3f48a50dc1118b13f5aa3bd77dabf4fc26910ac  .env.production.example
d6aca7804301dcf082cf10444bc3c407c6a952d7a44ae540b05935b59a40cbcc  DECISIONS.md
40ae8f29b8970d0a6b2fc8c996f4ca4f459611ff4299ee6fb0dea0a71c920d11  apps/backend/src/api/api.module.ts
a9fde3393013b9b7ab4f5fd725e3f2d2fa132a50e65d9feeae0d17566bfb450f  apps/backend/src/api/routes/calendar-reservations.controller.ts
ab5e5a545a4bbb250e5610d27073135f37b74ec3d884c715ca922325e8dc197f  docs/CALENDAR_RESERVATION_ROLLOUT.md
59fb99c48954b50655c21f47d1a8be69c280c95b08a6453ac0bc29fcd2deea3a  docs/OPERATIONS.md
15c143f6b888ebe2521becfa4787ecf958422479a2e200013105b7d9ba739d8d  libraries/helpers/src/bulk-scheduler/calendar-reservation.contract.ts
a5b57d32dcf69a29782bd9b59ed95797565f36550f6d65ecd9a2e35bcb71d7cd  libraries/helpers/src/bulk-scheduler/calendar-reservation.contract.spec.ts
2e7ff7a29d9f2037ebab7d246d26629c56f9cbe75e47db1cce3fe365c8009d7d  libraries/helpers/src/configuration/production.env.preflight.spec.ts
99f07b11d834315ea7004ca36793d00fde279098b49342129bf54bb83f79e42e  libraries/nestjs-libraries/src/database/prisma/schema.prisma
0c4e88937e77db051ed4c644c1e73a8d42104d93c2b73d6e9583a0a57802c444  libraries/nestjs-libraries/src/database/prisma/migrations/20260813003000_calendar_reservation_ledger/migration.sql
8c53c9a87e4decd6a940afc8579178ed571ad150cdecb1e87ad5103f3f617c95  libraries/nestjs-libraries/src/database/prisma/database.module.ts
7281cc251c634c4c6e6341bca1c3717514ddb0468113777cec090b9fe25fa9db  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts
471215b813ee93b51319b4341b671867a2d53f594a70a3a9ee856ee0b0806f88  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.service.ts
4d65fc90e0ceb7b81fa37a97ce9cf19cb80e76eba404a58979cac47c87743a80  libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.service.spec.ts
4f1fabe7b2e70c62d926fb9fff53c4a253b248f1e12fa975dadbaffd66048a59  scripts/verify-production-env.cjs
8d97b7710bc897e190c135bee3cd4cae15cc44fe1963da35972e1c61b785ac04  test/integration/calendar.reservation.int.spec.ts
```

Rollback: set `CALENDAR_RESERVATION_ENFORCEMENT=false`; for a ledger incident
also set `CALENDAR_RESERVATION_KILL_ALL=true`. Callers must fail classified and
must never fall back to direct calendar writes. Keep the additive tables and
audit evidence; schema removal is a reviewed forward migration.
