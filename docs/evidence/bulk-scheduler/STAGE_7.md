# Stage 7 evidence - mandatory tenant isolation and 100,000-job gate

Recorded: 2026-08-13 (America/New_York)

Decision: `DECISIONS.md`, ADR-032. Stage 7 is complete. It does not certify a
provider tuple and did not create a Post, PublishingJob, or provider mutation.

## Delivered gate

- `test/integration/bulk.scheduler.tenant-isolation.int.spec.ts` is a mandatory
  PostgreSQL suite with no conditional skip. It proves tenant-qualified reads,
  cursors, pins, retries, private-media job context, composite foreign keys,
  audit events, and issues.
- `test/load/bulk-scheduler-100k.load.spec.ts` creates exactly 1,000 private
  asset ledgers and 100 designated non-publishing connections, expands and
  authoritatively reserves 100,000 jobs, pages all 100,000, claims disjoint
  shards, retries, pauses/resumes, pins, cancels 99,999 in bounded batches,
  aggregates outcomes, proves event isolation, and deletes only its generated
  fixture.
- Planning, reservation acquisition/linking, pagination, claims, and
  cancellation are bounded. Reservation batches and cancellation batches are
  at most 500; API pages are at most 100; each claim is at most 250.
- The shared planner/API/UI limit is exactly 100,000. Above-limit input writes
  a durable `campaign_overflow` issue and returns classified
  `campaign_expansion_limit_exceeded`; it never allocates/truncates a partial
  expansion.
- `claimDue` accepts a tenant shard. UTC scheduling avoids repeated formatter
  construction, timezone validation is cached, per-account planning does not
  repeatedly filter the full destination set, and first/last time calculation
  avoids spread over 100,000 values.
- GitHub Actions starts PostgreSQL 16, deploys all migrations, runs both gates,
  and retains the benchmark JSON even when the workload fails. Neither gate
  can be changed into a conditional skip without changing reviewed test code.

## Defects exposed and fixed by the exact workload

1. The first full attempt reached reservation linking but Prisma's default
   five-second interactive transaction expired at 5,272 ms. The link is now a
   direct bounded atomic `UPDATE ... FROM` after the load gate proved the row
   ownership preconditions; no giant interactive transaction remains.
2. The second attempt proved the 100,000-row plan, reservations, pagination,
   claims, retry, pause/resume, and pin path, then cancellation exceeded the
   default five-second interactive transaction at 6,036 ms. Cancellation now
   has explicit 10-second acquisition and 30-second transaction bounds and
   still processes at most 500 items.
3. Batch reservation conflict projection originally let a later conflicted
   row replace the true active owner in the in-memory slot map. The repository
   now preserves the active owner; unit/integration tests cover this ordering.

The failed attempts were not accepted as evidence and their workload was not
reduced. The final command below was run after all three fixes and after the
shared 100,000 expansion guard.

## Final mandatory release-runtime command and unedited result

```text
> pnpm dlx node@22.12.0 node_modules/jest/bin/jest.js --selectProjects integration --runInBand test/integration/bulk.scheduler.tenant-isolation.int.spec.ts
> $env:NODE_OPTIONS='--max-old-space-size=4096'; pnpm dlx node@22.12.0 node_modules/jest/bin/jest.js --selectProjects load --runInBand test/load/bulk-scheduler-100k.load.spec.ts

PASS integration test/integration/bulk.scheduler.tenant-isolation.int.spec.ts
  Bulk Scheduler mandatory tenant-isolation gate
    √ scopes campaign, intent, issue, job, upload, reservation, and cursor reads (38 ms)
    √ rejects cross-tenant pin, retry, job context, and private-media operations (51 ms)
    √ enforces tenant equality in composite foreign keys (36 ms)
    √ keeps durable audit and issue events isolated by organization (7 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        19.315 s

PASS load test/load/bulk-scheduler-100k.load.spec.ts (367.334 s)
  Bulk Scheduler mandatory 100,000-job database gate
    √ plans, reserves, pages, claims, retries, pauses, cancels, aggregates, and isolates exactly 100,000 jobs (365227 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        367.439 s
```

Machine artifact:
`docs/evidence/bulk-scheduler/benchmarks/stage7-100k.json`.

Final measured result:

| Measure | Result | Gate |
|---|---:|---:|
| Expanded jobs | 100,000 | exactly 100,000 |
| Authoritative reservations | 100,000 | exactly 100,000 |
| Cursor pages / unique jobs | 1,000 / 100,000 | complete, unique |
| Claims / retry claims | 1,000 / 250 | disjoint and tenant-isolated |
| Cancellation batches | 200 | at most 500 each |
| Cancelled / pinned preserved | 99,999 / 1 | exact |
| Posts / PublishingJobs | 0 / 0 | must be zero |
| Plan and reserve | 222,986.93 ms | at most 900,000 ms |
| Total | 365,267.30 ms | recorded |
| Peak RSS | 827.54 MiB | at most 1,536 MiB |
| Peak heap | 695.63 MiB | recorded |
| Tenant audit events | 100,611 | isolated |

The final local benchmark ran under the exact required Node 22.12 runtime and
honestly records `gitRevision: null` because this shared worktree already
contained uncommitted user changes and no safe broad commit could represent
it. CI sets `GITHUB_SHA` and names the retained artifact with that exact SHA;
the CI artifact remains the immutable-commit proof, while this run removes the
earlier local runtime-version caveat.

## Relevant final validation

```text
> pnpm exec jest --selectProjects unit --runInBand
Test Suites: 102 passed, 102 total
Tests:       725 passed, 725 total

> pnpm run test:integration
Test Suites: 9 passed, 9 total
Tests:       49 passed, 49 total

> pnpm run typecheck
exit=0

> pnpm run lint
exit=0

> pnpm run verify:architecture
{"ok":true,"guard":"calendar-writer-architecture","approvedPublishDateWriters":["libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts"],"approvedPostRetirementWriters":["libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts","libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts","libraries/nestjs-libraries/src/database/prisma/organizations/org-data.service.ts","libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.ts","libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.repository.ts"]}

> pnpm run build
frontend: compiled successfully; 77/77 static pages generated
backend: nest build exit=0
orchestrator: nest build exit=0
```

Fresh-database verification applied all 27 migrations, inspected the campaign,
asset, upload, reservation, provider-media, and attempt constraint sets, found
only `ProviderMediaGrant.tokenHash` among provider capability token columns,
and dropped the generated database:

```text
All migrations have been successfully applied.
latestMigration={"migration_name":"20260813042000_bulk_upload_retry_fields","finished":true}
DISPOSABLE_DATABASE_DROPPED=publishly_migration_verify_1786615408996_c9eeb8
```

## Content-addressed checkpoint

Because the shared worktree already contained extensive unrelated user work,
the clean Stage 7 checkpoint is the scoped 16-file SHA-256 manifest at
`docs/evidence/bulk-scheduler/STAGE_7_CHECKPOINT.sha256`. Its verification
checked all 16 entries with zero mismatches.

## Rollback

Set `BULK_SCHEDULER_KILL_ALL=true`, disable the materializer, pause affected
campaigns, and retain campaign/issue/job/reservation/attempt ledgers. Use
`CALENDAR_RESERVATION_KILL_ALL=true` only for a reservation incident. Do not
route around the reservation writer or V109, reduce the workload, or remove
the CI gates. Migrations are additive; schema rollback is a reviewed forward
migration.
