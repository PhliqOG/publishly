# Publishly Bulk Scheduler scoped changeset

This inventory covers the eight-stage Bulk Scheduler implementation. The Git
worktree already contained extensive unrelated Publishly changes, so this is a
feature-scoped inventory rather than a claim that every dirty path belongs to
Bulk Scheduler.

## Decisions, configuration, generated authority, and CI

- `DECISIONS.md`
- `.env.example`
- `.env.production.example`
- `.github/workflows/build.yml`
- `package.json`
- `jest.config.ts`
- `data/bulk-scheduler-capabilities.json`
- `scripts/generate-bulk-scheduler-capabilities.cjs`
- `scripts/generate-bulk-scheduler-capabilities.mjs`
- `scripts/verify-calendar-writers.cjs`
- `scripts/verify-calendar-writers.d.cts`
- `scripts/verify-fresh-migrations.cjs`
- `scripts/verify-production-env.cjs`
- `scripts/verify-production-env.d.cts`
- `scripts/bulk-scheduler-canary.cjs`

## API and UI

- `apps/backend/src/api/api.module.ts`
- `apps/backend/src/api/routes/bulk-import.controller.ts`
- `apps/backend/src/api/routes/bulk-import.canary.spec.ts`
- `apps/backend/src/api/routes/calendar-reservations.controller.ts`
- `apps/backend/src/api/routes/provider-media.controller.ts`
- `apps/backend/src/api/routes/provider-media.controller.spec.ts`
- `apps/backend/src/main.ts`
- `apps/frontend/src/app/(app)/(site)/bulk-scheduler/page.tsx`
- `apps/frontend/src/components/bulk-scheduler/bulk-scheduler.component.tsx`
- `apps/frontend/src/components/bulk-scheduler/bulk-scheduler.logic.ts`
- `apps/frontend/src/components/bulk-scheduler/bulk-scheduler.logic.spec.ts`
- `apps/frontend/src/components/layout/top.menu.tsx`
- `apps/frontend/src/components/marketing/marketing.config.ts`

## Contracts, validation, and private media

- Every file in `libraries/helpers/src/bulk-scheduler/`
- `libraries/helpers/src/configuration/configuration.checker.ts`
- `libraries/helpers/src/configuration/configuration.checker.spec.ts`
- `libraries/helpers/src/configuration/production.env.preflight.spec.ts`
- `libraries/nestjs-libraries/src/dtos/bulk/create.bulk.campaign.dto.ts`
- `libraries/nestjs-libraries/src/upload/private-media.storage.ts`
- `libraries/nestjs-libraries/src/upload/private-media.storage.spec.ts`
- `libraries/nestjs-libraries/src/integrations/provider.capabilities.ts`
- `libraries/nestjs-libraries/src/integrations/provider.capabilities.spec.ts`
- `libraries/nestjs-libraries/src/integrations/social.abstract.ts`
- `libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`
- `libraries/nestjs-libraries/src/integrations/social/instagram.ambiguity.spec.ts`

## Database, calendar, attempts, and V109 execution

- Every file in `libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/`
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
- `libraries/nestjs-libraries/src/database/prisma/database.module.ts`
- `libraries/nestjs-libraries/src/database/prisma/bulk-import/bulk-import.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/bulk-import/bulk-import.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.deletion.spec.ts`
- `libraries/nestjs-libraries/src/database/prisma/organizations/org-data.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.spec.ts`
- `libraries/nestjs-libraries/src/database/prisma/publishing-jobs/publishing-attempt.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/publishing-jobs/publishing-job.repository.ts`
- `apps/orchestrator/src/activities/bulk-import.activity.ts`
- `apps/orchestrator/src/activities/post.activity.ts`
- `apps/orchestrator/src/app.module.ts`
- `apps/orchestrator/src/workflows/index.ts`
- `apps/orchestrator/src/workflows/bulk-import.workflow.v1.0.1.ts`
- `apps/orchestrator/src/workflows/bulk-campaign-materializer.workflow.v1.0.1.ts`
- `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.9.ts`
- `apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.9.spec.ts`

## Additive migrations

- `20260812230000_bulk_campaign_ledgers`
- `20260812233000_private_provider_media`
- `20260813003000_calendar_reservation_ledger`
- `20260813020000_calendar_writer_cutover`
- `20260813023000_calendar_prepost_terminal_attempts`
- `20260813030000_bulk_campaign_execution`
- `20260813031000_bulk_campaign_job_optional_slots`
- `20260813032000_calendar_campaign_handoff`
- `20260813033000_bulk_campaign_pause_origin`
- `20260813040000_bulk_resumable_uploads`
- `20260813041000_bulk_upload_retries`
- `20260813042000_bulk_upload_retry_fields`

Each directory is under
`libraries/nestjs-libraries/src/database/prisma/migrations/` and contains a
`migration.sql` file.

## Integration/load gates

- `test/integration/bulk.import.int.spec.ts`
- `test/integration/bulk.scheduler.execution.int.spec.ts`
- `test/integration/bulk.scheduler.tenant-isolation.int.spec.ts`
- `test/integration/bulk.scheduler.upload.int.spec.ts`
- `test/integration/calendar.reservation.int.spec.ts`
- `test/integration/calendar.writer.cutover.int.spec.ts`
- `test/load/bulk-scheduler-100k.load.spec.ts`

## Documentation, runbooks, and evidence

- `docs/BULK_SCHEDULER_API.md`
- `docs/BULK_SCHEDULER_CANARY.md`
- `docs/BULK_SCHEDULER_CAPABILITIES.md`
- `docs/CALENDAR_RESERVATION_ROLLOUT.md`
- `docs/PRIVATE_PROVIDER_MEDIA.md`
- Bulk Scheduler sections in `docs/API.md`, `docs/ARCHITECTURE.md`,
  `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`, and `docs/OPERATIONS.md`
- Every file under `docs/evidence/bulk-scheduler/`, including the Stage 7
  benchmark and scoped SHA-256 checkpoints
