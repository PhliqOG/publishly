# Stage 1 evidence — fail-closed capability matrix

Recorded: 2026-08-12 (America/New_York)

Decision: `DECISIONS.md`, ADR-025.

## Customer availability snapshot

- Matrix schema version: `1`
- Authored tuples: `9`
- Customer-enabled tuples: `0`
- Certified tuples: `0`
- Unknown tuple policy: `disabled`
- Global rollback: `BULK_SCHEDULER_KILL_ALL`
- Per-tuple rollback: one permanent `BULK_SCHEDULER_KILL_*` variable per row

All nine rows are narrowly scoped video candidates backed by an existing mutation adapter and read-back implementation. They remain disabled because private transport and a controlled real-provider canary have not yet passed.

## Commands and unedited results

```text
> node scripts/generate-bulk-scheduler-capabilities.mjs
Generated docs\BULK_SCHEDULER_CAPABILITIES.md

> node scripts/generate-bulk-scheduler-capabilities.mjs --check
exit=0

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts --verbose
Running one project: unit
PASS unit libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts
  Bulk Scheduler tuple capability matrix
    √ fails closed for unknown tuples (3 ms)
    √ does not advertise a tuple before private transport and a canary
    √ honors the permanent global and per-tuple kill switches first
    √ cannot use canary mode to bypass unfinished private transport (1 ms)
    √ contains only explicit video-first candidate tuples (2 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        3.421 s
Ran all test suites within paths "libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts".

> node node_modules/typescript/bin/tsc --noEmit -p apps/backend/tsconfig.json --pretty false
exit=0

> node node_modules/typescript/bin/tsc --noEmit -p apps/frontend/tsconfig.json --pretty false
exit=0

> node node_modules/jest/bin/jest.js --selectProjects unit --runInBand
Running one project: unit
Test Suites: 80 passed, 80 total
Tests:       556 passed, 556 total
Snapshots:   0 total
Time:        207.57 s
Ran all test suites.

> git diff --check -- DECISIONS.md data/bulk-scheduler-capabilities.json libraries/helpers/src/bulk-scheduler scripts/generate-bulk-scheduler-capabilities.mjs docs/BULK_SCHEDULER_CAPABILITIES.md apps/backend/src/api/routes/bulk-import.controller.ts apps/frontend/src/components/marketing/marketing.config.ts package.json .env.example
exit=0
```

## Failure found and fixed

The first backend typecheck returned the following exact compiler error; the matrix was changed to expose a readonly tuple array, then both compiler gates passed:

```text
libraries/helpers/src/bulk-scheduler/capability.matrix.ts(43,14): error TS2322: Type 'Readonly<{ tuples: readonly Readonly<BulkSchedulerTuple>[]; schemaVersion: number; updated: string; globalKillSwitchEnv: string; canaryModeEnv: string; canaryTupleListEnv: string; unknownTuplePolicy: "disabled"; }>' is not assignable to type 'Readonly<BulkSchedulerMatrix>'.
  Types of property 'tuples' are incompatible.
    The type 'readonly Readonly<BulkSchedulerTuple>[]' is 'readonly' and cannot be assigned to the mutable type 'BulkSchedulerTuple[]'.
```

## Content-addressed checkpoint

The repository entered this stage with extensive unrelated tracked and untracked work. To avoid committing the user's pre-existing changes, the checkpoint is a scoped SHA-256 manifest rather than a broad Git commit.

```text
c619354860d6d0849b357d6d5e395cceee45d5fc7642fb76dd096c4c17fdc465  DECISIONS.md
a438c55e387b471319bb939a1a10e34b922cba17625f474268e151b1f833bd02  .env.example
42b1399a2f5d3e2b787553f61a8849ad5cc96b410b4b630f1d3af875a4d2e586  package.json
6c1d695e38b733b9143d872f144b6531667f16a74dd8342b93e1e98c538171c8  data/bulk-scheduler-capabilities.json
b919daca8e6db18ab1722ad767420e183a79df558590504d7ca05c21c17419ac  libraries/helpers/src/bulk-scheduler/capability.matrix.ts
99556f9377fb936e2423c8b17e26c3afe5a1195cbcfece14b1b6690a569211e8  libraries/helpers/src/bulk-scheduler/capability.matrix.spec.ts
538f1cb1db10ec4532e1eb09dc78a1ccd2014b7e1004dae33854d36d6cf4efeb  scripts/generate-bulk-scheduler-capabilities.mjs
1d20230443efc30651afcfbc378ccde41be85b411a37d10930cb701a435e8fb8  docs/BULK_SCHEDULER_CAPABILITIES.md
5b3d8d1e3c57eeb044f6852c0a46401b4cba4a65a5065b25240ecd10881d2c08  apps/backend/src/api/routes/bulk-import.controller.ts
7cf619f262b1ca84bd00ce04d5a814121bd08d291f7f8c4e4b8ef3888b7d8d6b  apps/frontend/src/components/marketing/marketing.config.ts
```

Rollback: set `BULK_SCHEDULER_KILL_ALL=true` for immediate runtime denial; revert the Stage 1 files above to remove the surface entirely. No tuple is enabled at this checkpoint.
