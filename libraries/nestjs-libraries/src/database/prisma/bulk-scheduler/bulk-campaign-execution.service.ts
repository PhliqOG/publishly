import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BulkCampaignJob,
  BulkCampaignIssueClass,
  BulkCampaignJobState,
  PostFailureClass,
  Prisma,
} from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { randomUUID } from 'node:crypto';
import {
  BULK_CAMPAIGN_ISSUE_CODES,
  BulkCampaignIntentV1,
  BulkCampaignIssueCode,
  bulkPageLimit,
  decodeBulkCursor,
  encodeBulkCursor,
  validateBulkCampaignIntent,
} from '@gitroom/helpers/bulk-scheduler/campaign.contract';
import { bulkTupleDecisionForIntegration } from '@gitroom/helpers/bulk-scheduler/capability.matrix';
import {
  BULK_CAMPAIGN_JOB_STATES,
  BulkPlanningSlot,
  iterateBulkScheduleSlots,
  planBulkCampaign,
} from '@gitroom/helpers/bulk-scheduler/execution.contract';
import {
  bulkCampaignExpandedJobCount,
  MAX_BULK_CAMPAIGN_JOBS,
} from '@gitroom/helpers/bulk-scheduler/limits.contract';
import { opaqueBulkPrivateMediaPath } from '@gitroom/helpers/bulk-scheduler/provider-media.contract';
import type { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import {
  canonicalJson,
  sha256,
  validateIdempotencyKey,
} from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { BulkCampaignService } from './bulk-campaign.service';
import { CalendarReservationService } from './calendar-reservation.service';
import { BulkCampaignExecutionRepository } from './bulk-campaign-execution.repository';

const PLAN_CHUNK_SIZE = 500;
const RESERVATION_CONFLICT_ATTEMPT_LIMIT = 10_000;

function deterministicId(prefix: string, ...parts: Array<string | number>) {
  return `${prefix}_${sha256(parts.join(':')).slice(0, 32)}`;
}

function envInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, max)
    : fallback;
}

function classifiedIssue(
  code: BulkCampaignIssueCode,
  reason: string
): {
  issueClass: BulkCampaignIssueClass;
  failureClass: PostFailureClass;
  retryable: boolean;
  code: BulkCampaignIssueCode;
  reason: string;
} {
  const definition = BULK_CAMPAIGN_ISSUE_CODES[code];
  return { ...definition, code, reason };
}

@Injectable()
export class BulkCampaignExecutionService {
  private readonly logger = new Logger(BulkCampaignExecutionService.name);

  constructor(
    private _repository: BulkCampaignExecutionRepository,
    private _campaigns: BulkCampaignService,
    private _reservations: CalendarReservationService,
    private _posts: PostsService
  ) {}

  private async progressToPlanning(
    organizationId: string,
    campaignId: string,
    state: string,
    userId?: string
  ) {
    const actor = {
      userId,
      actorType: userId ? ('user' as const) : ('system' as const),
    };
    let current = state;
    if (!['DRAFT', 'UPLOADING', 'VALIDATING', 'PLANNING'].includes(current)) {
      return;
    }
    for (const next of ['UPLOADING', 'VALIDATING', 'PLANNING'] as const) {
      if (current === next) continue;
      const order = ['DRAFT', 'UPLOADING', 'VALIDATING', 'PLANNING'];
      if (order.indexOf(current) > order.indexOf(next)) continue;
      const changed = await this._campaigns.transition({
        organizationId,
        campaignId,
        to: next,
        actor,
      });
      current = changed.state;
    }
  }

  async planAndReserve(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
  }) {
    const source = await this._repository.getPlanningSource(
      input.organizationId,
      input.campaignId
    );
    if (!source) throw new NotFoundException('Campaign not found.');
    if (['CANCELLED', 'COMPLETED', 'FAILED'].includes(source.state)) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'campaign_terminal',
        reason: `A ${source.state.toLowerCase()} campaign cannot be planned.`,
      });
    }
    if (
      source.state === 'PAUSED' &&
      !['SCHEDULED', 'DISPATCHING'].includes(source.pausedFromState || '')
    ) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'campaign_paused_before_scheduling',
        reason:
          'Resume this campaign to finish upload or validation before planning. A scheduled or dispatching campaign may be replanned while paused.',
      });
    }
    const currentIntent = source.intents.find(
      (intent) => intent.revision === source.currentRevision
    );
    const validation = validateBulkCampaignIntent(currentIntent?.intent);
    if (!currentIntent || validation.valid === false) {
      throw new UnprocessableEntityException({
        failureClass: 'data_problem',
        code: 'invalid_campaign_intent',
        reason:
          validation.valid === false
            ? validation.reason
            : 'The campaign current intent revision is missing.',
      });
    }
    await this._campaigns.assertDestinations(
      input.organizationId,
      validation.value
    );
    const assets = source.assets
      .filter((link) => link.asset.state === 'READY' && !link.asset.deletedAt)
      .map((link) => ({
        id: link.asset.id,
        originalName: link.asset.originalName,
        position: link.position,
        pinned: link.pinned,
      }));
    if (!assets.length) {
      throw new UnprocessableEntityException({
        failureClass: 'data_problem',
        code: 'campaign_has_no_ready_assets',
        reason:
          'Upload at least one validated, non-quarantined video before planning.',
      });
    }
    let plan;
    try {
      plan = planBulkCampaign({ assets, intent: validation.value });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'best_time_not_available'
      ) {
        throw new UnprocessableEntityException({
          failureClass: 'data_problem',
          code: 'best_time_not_available',
          reason:
            'Best-time slots are disabled until a deterministic, matrix-backed implementation is available.',
        });
      }
      if (
        error instanceof Error &&
        error.message === 'campaign_expansion_limit_exceeded'
      ) {
        const multiplier =
          validation.value.distribution.mode === 'cross_post'
            ? validation.value.selection.destinations.length
            : 1;
        const expandedJobCount = bulkCampaignExpandedJobCount({
          assetCount: assets.length,
          destinationCount: validation.value.selection.destinations.length,
          distributionMode: validation.value.distribution.mode,
        });
        const reason = `This campaign expands to ${expandedJobCount.toLocaleString(
          'en-US'
        )} jobs. The maximum is ${MAX_BULK_CAMPAIGN_JOBS.toLocaleString(
          'en-US'
        )}; split the assets or destinations into smaller campaigns.`;
        await this._campaigns.recordIssue({
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          eventKey: `campaign-overflow:${source.currentRevision}:${expandedJobCount}`,
          code: 'campaign_overflow',
          reason,
          subjectType: 'campaign',
          subjectId: input.campaignId,
          details: {
            assetCount: assets.length,
            destinationCount: validation.value.selection.destinations.length,
            multiplier,
            expandedJobCount,
            maximumExpandedJobs: MAX_BULK_CAMPAIGN_JOBS,
          },
        });
        throw new UnprocessableEntityException({
          failureClass: 'data_problem',
          code: 'campaign_expansion_limit_exceeded',
          reason,
          expandedJobCount,
          maximumExpandedJobs: MAX_BULK_CAMPAIGN_JOBS,
        });
      }
      throw error;
    }
    const pairKey = (value: {
      assetId: string;
      integrationId: string;
      capabilityTupleId: string;
    }) =>
      `${value.assetId}\u0000${value.integrationId}\u0000${value.capabilityTupleId}`;
    const plannedByPair = new Map(
      [...plan.jobs, ...plan.overflow].map((job) => [pairKey(job), job])
    );
    const preservable = await this._repository.listPreservableJobs(
      input.organizationId,
      input.campaignId
    );
    if (preservable.length > 100_000) {
      throw new ServiceUnavailableException({
        failureClass: 'recoverable',
        code: 'campaign_preservation_limit_exceeded',
        reason:
          'This campaign has more than 100,000 pinned or published items. Split it before replanning.',
      });
    }
    const preservedPairs = new Set<string>();
    const preservationRows: Array<{
      id: string;
      ordinal: number;
      destinationOrdinal: number;
    }> = [];
    let preservedExtraCount = 0;
    for (const existing of preservable) {
      if (
        existing.state === 'CANCELLED' ||
        existing.state === 'FINAL_FAILURE'
      ) {
        continue;
      }
      const key = pairKey(existing);
      if (preservedPairs.has(key)) continue;
      const replacement = plannedByPair.get(key);
      if (replacement) {
        preservedPairs.add(key);
        preservationRows.push({
          id: existing.id,
          ordinal: replacement.ordinal,
          destinationOrdinal: replacement.destinationOrdinal,
        });
      } else if (existing.pinned && existing.state !== 'PUBLISHED') {
        preservedPairs.add(key);
        preservationRows.push({
          id: existing.id,
          ordinal: plan.expansion.expandedJobCount + preservedExtraCount,
          destinationOrdinal: existing.destinationOrdinal,
        });
        preservedExtraCount += 1;
      }
    }
    for (
      let offset = 0;
      offset < preservationRows.length;
      offset += PLAN_CHUNK_SIZE
    ) {
      await this._repository.preserveJobsChunk({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        intentRevision: source.currentRevision,
        rows: preservationRows.slice(offset, offset + PLAN_CHUNK_SIZE),
      });
    }
    for (;;) {
      const retired = await this._repository.retireStaleRevisionBatch({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        currentRevision: source.currentRevision,
        limit: PLAN_CHUNK_SIZE,
        userId: input.userId,
        now: new Date(),
      });
      if (retired.remaining === 0) break;
      if (retired.retired === 0) {
        throw new Error('campaign_replan_retirement_stalled');
      }
    }
    if (source.state !== 'PAUSED') {
      await this.progressToPlanning(
        input.organizationId,
        input.campaignId,
        source.state,
        input.userId
      );
    }

    const rows: Prisma.BulkCampaignJobCreateManyInput[] = [
      ...plan.jobs
        .filter((job) => !preservedPairs.has(pairKey(job)))
        .map((job) => ({
          id: deterministicId(
            'bulk_job',
            input.organizationId,
            input.campaignId,
            source.currentRevision,
            job.ordinal,
            job.assetId,
            job.integrationId
          ),
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          intentRevision: source.currentRevision,
          assetId: job.assetId,
          integrationId: job.integrationId,
          capabilityTupleId: job.capabilityTupleId,
          ordinal: job.ordinal,
          destinationOrdinal: job.destinationOrdinal,
          state: 'PLANNED' as const,
          scheduledAt: job.slot.scheduledAt,
          localScheduledAt: job.slot.localScheduledAt,
          timezone: job.slot.timezone,
          utcOffsetMinutes: job.slot.utcOffsetMinutes,
          dstFold: job.slot.dstFold,
          pinned: job.pinned,
          outcomeCode: 'campaign_job_planned',
          outcomeReason:
            'The deterministic planner assigned this expanded campaign job a slot.',
        })),
      ...plan.overflow
        .filter((job) => !preservedPairs.has(pairKey(job)))
        .map((job) => ({
          id: deterministicId(
            'bulk_job',
            input.organizationId,
            input.campaignId,
            source.currentRevision,
            job.ordinal,
            job.assetId,
            job.integrationId
          ),
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          intentRevision: source.currentRevision,
          assetId: job.assetId,
          integrationId: job.integrationId,
          capabilityTupleId: job.capabilityTupleId,
          ordinal: job.ordinal,
          destinationOrdinal: job.destinationOrdinal,
          state: 'OVERFLOW' as const,
          scheduledAt: null,
          localScheduledAt: null,
          timezone: validation.value.schedule.timezone,
          utcOffsetMinutes: null,
          dstFold: null,
          pinned: false,
          outcomeClass: 'overflow' as const,
          outcomeCode: job.code,
          outcomeReason: job.reason,
        })),
    ].sort((left, right) => left.ordinal - right.ordinal);

    for (let offset = 0; offset < rows.length; offset += PLAN_CHUNK_SIZE) {
      const chunk = rows.slice(offset, offset + PLAN_CHUNK_SIZE);
      const issues = chunk
        .filter((job) => job.state === 'OVERFLOW')
        .map((job) => {
          const eventKey = `capacity_shortage:${job.id}`;
          return {
            id: deterministicId(
              'bulk_issue',
              input.organizationId,
              input.campaignId,
              eventKey
            ),
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            eventKey,
            issueClass: 'overflow' as const,
            failureClass: 'data_problem' as const,
            code: 'capacity_shortage',
            reason: job.outcomeReason,
            subjectType: 'publish_job' as const,
            subjectId: job.id,
            retryable: false,
          };
        });
      const result = await this._repository.insertPlanChunk({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        intentRevision: source.currentRevision,
        chunkOrdinal: Math.floor(offset / PLAN_CHUNK_SIZE),
        jobs: chunk,
        issues,
      });
      if (result.type === 'stale') {
        throw new ConflictException({
          failureClass: 'recoverable',
          code: 'campaign_revision_conflict',
          reason:
            'The campaign intent changed while its plan was being written.',
        });
      }
    }
    const persisted = await this._repository.countRevisionJobs({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      intentRevision: source.currentRevision,
    });
    const expectedPersisted =
      plan.expansion.expandedJobCount + preservedExtraCount;
    if (persisted !== expectedPersisted) {
      throw new ServiceUnavailableException({
        failureClass: 'recoverable',
        code: 'campaign_plan_incomplete',
        reason: `The plan ledger contains ${persisted} of ${expectedPersisted} expected jobs. Retry planning before dispatch.`,
      });
    }
    const refreshed = await this._campaigns.get(
      input.organizationId,
      input.campaignId
    );
    if (refreshed.state === 'PLANNING') {
      await this._campaigns.transition({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        to: 'RESERVING',
        actor: {
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
      });
    }
    await this.reserveRevision({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      intentRevision: source.currentRevision,
      intent: validation.value,
    });
    const afterReservation = await this._campaigns.get(
      input.organizationId,
      input.campaignId
    );
    if (afterReservation.state === 'RESERVING') {
      await this._campaigns.transition({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        to: 'SCHEDULED',
        actor: {
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
      });
    }
    Sentry.metrics.count('bulk_campaign_jobs_planned', rows.length);
    Sentry.metrics.count('bulk_campaign_jobs_overflow', plan.overflow.length);
    return {
      campaignId: input.campaignId,
      revision: source.currentRevision,
      expansion: plan.expansion,
      preservedCount: preservationRows.length,
      preservedExtraCount,
      firstScheduledAt: plan.firstScheduledAt,
      lastScheduledAt: plan.lastScheduledAt,
      overflowCount: plan.overflow.length,
      dstGapCount: plan.dstGapCount,
      state: afterReservation.state,
    };
  }

  private async recordJobIssue(input: {
    organizationId: string;
    campaignId: string;
    jobId: string;
    code: BulkCampaignIssueCode;
    reason: string;
    details?: Prisma.InputJsonValue;
  }) {
    const classified = classifiedIssue(input.code, input.reason);
    const eventKey = `${input.code}:${input.jobId}`;
    return this._repository.recordJobIssue({
      id: deterministicId(
        'bulk_issue',
        input.organizationId,
        input.campaignId,
        eventKey
      ),
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      eventKey,
      issueClass: classified.issueClass,
      failureClass: classified.failureClass,
      code: classified.code,
      reason: classified.reason,
      jobId: input.jobId,
      retryable: classified.retryable,
      details: input.details,
    });
  }

  private async reserveRevision(input: {
    organizationId: string;
    campaignId: string;
    intentRevision: number;
    intent: BulkCampaignIntentV1;
  }) {
    const mode = await this._reservations.resolveWriterMode(
      input.organizationId
    );
    if (mode !== 'AUTHORITATIVE') {
      throw new ServiceUnavailableException({
        failureClass: 'recoverable',
        code: 'calendar_campaign_requires_authority',
        reason:
          'Bulk Scheduler cannot reserve until this workspace uses the verified authoritative reservation ledger.',
      });
    }
    const states: BulkCampaignJobState[] = ['PLANNED', 'RESERVING', 'RESERVED'];
    const groupIntegrationIds =
      input.intent.cadence.scope === 'campaign'
        ? [undefined]
        : (
            await this._repository.listRevisionIntegrationIds({
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              intentRevision: input.intentRevision,
              states,
            })
          ).map((row) => row.integrationId);
    let stop = false;
    for (const integrationId of groupIntegrationIds) {
      const slots = iterateBulkScheduleSlots(input.intent);
      const markOverflow = async (job: BulkCampaignJob) => {
        const reason =
          'No additional spacing-respecting calendar slot remained after conflict resolution.';
        await this._repository.markOutcome({
          organizationId: input.organizationId,
          jobId: job.id,
          from: ['PLANNED', 'RESERVING'],
          to: 'OVERFLOW',
          outcomeClass: 'overflow',
          code: 'capacity_shortage',
          reason,
        });
        await this.recordJobIssue({
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          jobId: job.id,
          code: 'capacity_shortage',
          reason,
        });
      };
      const acquireSequential = async (
        job: BulkCampaignJob,
        startingAttempt = 0
      ) => {
        let attempt = startingAttempt;
        let reserved = false;
        while (attempt < RESERVATION_CONFLICT_ATTEMPT_LIMIT) {
          const next = slots.next();
          if (next.done !== false) break;
          attempt += 1;
          const slot = next.value as BulkPlanningSlot;
          const reservation = await this._reservations.acquire({
            organizationId: input.organizationId,
            integrationId: job.integrationId,
            ownerType: 'BULK_CAMPAIGN_SLOT',
            ownerId: job.id,
            campaignId: input.campaignId,
            source: 'bulk_scheduler_v1',
            writer: 'bulk_campaign_execution',
            scheduledAt: slot.scheduledAt,
            localScheduledAt: slot.localScheduledAt,
            timezone: slot.timezone,
            utcOffsetMinutes: slot.utcOffsetMinutes,
            dstFold: slot.dstFold,
            pinned: job.pinned,
            revision: attempt,
            idempotencyKey: `bulk-slot:${job.id}:r${attempt}`,
            state: 'COMMITTED',
            metadata: {
              campaignId: input.campaignId,
              campaignJobId: job.id,
              intentRevision: input.intentRevision,
              ordinal: job.ordinal,
            },
            actor: { actorType: 'system' },
          });
          if (!reservation.conflicted) {
            reserved = await this._repository.linkReservation({
              organizationId: input.organizationId,
              jobId: job.id,
              reservationId: reservation.reservation.id,
              slot,
            });
            if (!reserved) throw new Error('campaign_reservation_link_race');
            break;
          }
          await this.recordJobIssue({
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            jobId: job.id,
            code: 'calendar_conflict',
            reason: reservation.reservation.outcomeReason,
            details: {
              attemptedAt: slot.scheduledAt.toISOString(),
              behavior: input.intent.schedule.conflictBehavior,
              attempt,
            },
          });
          if (input.intent.schedule.conflictBehavior !== 'next_available') {
            await this._repository.markOutcome({
              organizationId: input.organizationId,
              jobId: job.id,
              from: ['RESERVING'],
              to: 'CONFLICTED',
              outcomeClass: 'conflicted',
              code: 'calendar_conflict',
              reason: reservation.reservation.outcomeReason,
            });
            stop = input.intent.schedule.conflictBehavior === 'stop';
            return;
          }
        }
        if (!reserved) await markOverflow(job);
      };
      let afterOrdinal: number | undefined;
      while (true) {
        const page = await this._repository.listRevisionJobsPage({
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          intentRevision: input.intentRevision,
          states,
          integrationId,
          afterOrdinal,
          limit: PLAN_CHUNK_SIZE,
        });
        if (!page.length) break;
        const pending: Array<{ job: BulkCampaignJob; slot: BulkPlanningSlot }> =
          [];
        for (const job of page) {
          if (job.state === 'RESERVED') {
            let candidate: IteratorResult<BulkPlanningSlot, void> =
              slots.next();
            while (
              candidate.done === false &&
              (candidate.value as BulkPlanningSlot).scheduledAt.getTime() <
                job.scheduledAt!.getTime()
            ) {
              candidate = slots.next();
            }
            if (
              candidate.done !== false ||
              (candidate.value as BulkPlanningSlot).scheduledAt.getTime() !==
                job.scheduledAt!.getTime()
            ) {
              throw new Error('campaign_reservation_replay_plan_drift');
            }
            continue;
          }
          if (stop) {
            await this._repository.markOutcome({
              organizationId: input.organizationId,
              jobId: job.id,
              from: ['PLANNED', 'RESERVING'],
              to: 'BLOCKED',
              outcomeClass: 'conflicted',
              code: 'calendar_conflict',
              reason:
                'Reservation stopped after an earlier conflict because conflictBehavior is stop.',
            });
            await this.recordJobIssue({
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              jobId: job.id,
              code: 'calendar_conflict',
              reason:
                'This item was not reserved after the campaign stop-on-conflict rule fired.',
            });
            continue;
          }
          if (input.intent.schedule.conflictBehavior === 'stop') {
            await this._repository.beginReservation({
              organizationId: input.organizationId,
              jobId: job.id,
            });
            await acquireSequential(job);
            continue;
          }
          const next = slots.next();
          if (next.done !== false) {
            await markOverflow(job);
            continue;
          }
          pending.push({ job, slot: next.value as BulkPlanningSlot });
        }
        if (pending.length) {
          const begun = await this._repository.beginReservationBatch({
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            jobIds: pending.map(({ job }) => job.id),
          });
          if (begun !== pending.length) {
            throw new Error('campaign_reservation_begin_batch_race');
          }
          const reservationResults = await this._reservations.acquireBatch(
            pending.map(({ job, slot }) => ({
              organizationId: input.organizationId,
              integrationId: job.integrationId,
              ownerType: 'BULK_CAMPAIGN_SLOT' as const,
              ownerId: job.id,
              campaignId: input.campaignId,
              source: 'bulk_scheduler_v1',
              writer: 'bulk_campaign_execution',
              scheduledAt: slot.scheduledAt,
              localScheduledAt: slot.localScheduledAt,
              timezone: slot.timezone,
              utcOffsetMinutes: slot.utcOffsetMinutes,
              dstFold: slot.dstFold,
              pinned: job.pinned,
              revision: 1,
              idempotencyKey: `bulk-slot:${job.id}:r1`,
              state: 'COMMITTED' as const,
              metadata: {
                campaignId: input.campaignId,
                campaignJobId: job.id,
                intentRevision: input.intentRevision,
                ordinal: job.ordinal,
              },
              actor: { actorType: 'system' as const },
            }))
          );
          const linkRows = pending.flatMap(({ job, slot }, index) =>
            reservationResults[index].conflicted
              ? []
              : [
                  {
                    jobId: job.id,
                    reservationId: reservationResults[index].reservation.id,
                    slot,
                  },
                ]
          );
          if (linkRows.length) {
            const linked = await this._repository.linkReservationBatch({
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              rows: linkRows,
            });
            if (linked !== linkRows.length) {
              throw new Error('campaign_reservation_link_batch_race');
            }
          }
          for (let index = 0; index < pending.length; index += 1) {
            const reservation = reservationResults[index];
            if (!reservation.conflicted) continue;
            const { job, slot } = pending[index];
            await this.recordJobIssue({
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              jobId: job.id,
              code: 'calendar_conflict',
              reason: reservation.reservation.outcomeReason,
              details: {
                attemptedAt: slot.scheduledAt.toISOString(),
                behavior: input.intent.schedule.conflictBehavior,
                attempt: 1,
              },
            });
            if (input.intent.schedule.conflictBehavior === 'keep_conflict') {
              await this._repository.markOutcome({
                organizationId: input.organizationId,
                jobId: job.id,
                from: ['RESERVING'],
                to: 'CONFLICTED',
                outcomeClass: 'conflicted',
                code: 'calendar_conflict',
                reason: reservation.reservation.outcomeReason,
              });
            } else {
              await acquireSequential(job, 1);
            }
          }
        }
        afterOrdinal = page.at(-1)!.ordinal;
        if (page.length < PLAN_CHUNK_SIZE) break;
      }
    }
  }

  private tupleGate(input: { tupleId: string; integrationId: string }) {
    return bulkTupleDecisionForIntegration(
      input.tupleId,
      input.integrationId,
      process.env
    );
  }

  async assertDispatchGate(organizationId: string, postId: string) {
    const job = await this._repository.getDispatchContext(
      organizationId,
      postId
    );
    if (!job) return { campaign: false as const, ready: true as const };
    if (job.campaign.state === 'PAUSED') {
      return {
        campaign: true as const,
        ready: false as const,
        code: 'campaign_paused',
        reason:
          'The campaign is paused; V109 will wait without invoking the provider.',
        delaySeconds: 60,
      };
    }
    const decision = this.tupleGate({
      tupleId: job.capabilityTupleId,
      integrationId: job.integrationId,
    });
    const valid =
      decision.eligible &&
      job.campaign.currentRevision === job.intentRevision &&
      ['SCHEDULED', 'DISPATCHING'].includes(job.campaign.state) &&
      ['SCHEDULED', 'DISPATCHING'].includes(job.state) &&
      job.asset.state === 'READY' &&
      !job.asset.deletedAt &&
      !job.integration.disabled &&
      !job.integration.deletedAt &&
      !!job.integration.token &&
      job.reservation?.state === 'COMMITTED' &&
      job.reservation.ownerType === 'POST' &&
      job.reservation.postId === postId &&
      job.publishingJob?.postId === postId;
    if (!valid) {
      const code: BulkCampaignIssueCode = !decision.eligible
        ? 'capability_tuple_disabled'
        : job.integration.disabled ||
          job.integration.deletedAt ||
          !job.integration.token
        ? 'connection_disconnected'
        : 'dispatch_failed';
      const reason = !decision.eligible
        ? decision.reason
        : 'The campaign dispatch gate found stale campaign, reservation, asset, connection, or PublishingJob state.';
      await this._repository.markOutcome({
        organizationId,
        jobId: job.id,
        from: ['SCHEDULED', 'DISPATCHING'],
        to: 'BLOCKED',
        outcomeClass: 'blocked',
        code,
        reason,
      });
      await this.recordJobIssue({
        organizationId,
        campaignId: job.campaignId,
        jobId: job.id,
        code,
        reason,
      });
      throw new HttpException(
        {
          failureClass: BULK_CAMPAIGN_ISSUE_CODES[code].failureClass,
          code,
          reason,
        },
        HttpStatus.CONFLICT
      );
    }
    return {
      campaign: true as const,
      ready: true as const,
      jobId: job.id,
      tupleId: job.capabilityTupleId,
    };
  }

  private rawPostBody(
    job: NonNullable<
      Awaited<ReturnType<BulkCampaignExecutionRepository['getJobContext']>>
    >
  ) {
    const intentRow = job.campaign.intents[0];
    const validation = validateBulkCampaignIntent(intentRow?.intent);
    if (
      !intentRow ||
      validation.valid === false ||
      intentRow.revision !== job.intentRevision
    ) {
      throw new Error('campaign_materializer_intent_mismatch');
    }
    const publication = validation.value.publication;
    const settings =
      publication?.settingsByDestination?.[job.integrationId] ||
      publication?.settingsByTuple?.[job.capabilityTupleId] ||
      {};
    const postId = deterministicId('bulk_post', job.organizationId, job.id);
    const group = deterministicId('bulk_group', job.organizationId, job.id);
    const body: CreatePostDto = {
      type: 'schedule',
      order: `bulk-materialize:${job.id}`,
      shortLink: false,
      date: job.scheduledAt!.toISOString(),
      scheduleIntent: {
        localScheduledAt: job.localScheduledAt!,
        timezone: job.timezone,
        utcOffsetMinutes: job.utcOffsetMinutes!,
        ...(job.dstFold === null ? {} : { dstFold: job.dstFold }),
      },
      tags: [],
      posts: [
        {
          integration: { id: job.integrationId },
          group,
          value: [
            {
              id: postId,
              content: publication?.caption || '',
              image: [
                {
                  id: job.assetId,
                  path: opaqueBulkPrivateMediaPath(job.assetId),
                },
              ],
              delay: 0,
            },
          ],
          settings: {
            ...JSON.parse(canonicalJson(settings)),
            __type: job.integration.providerIdentifier,
          } as any,
        },
      ],
    };
    (body.posts[0] as any).__publishlyTargetGroup = group;
    return { body, postId };
  }

  async materializeDue(input: { now?: Date; limit?: number }) {
    const now = input.now || new Date();
    const horizonHours = envInt(
      process.env.BULK_SCHEDULER_MATERIALIZE_HORIZON_HOURS,
      24,
      168
    );
    const limit = Math.max(
      1,
      Math.min(
        input.limit ||
          envInt(process.env.BULK_SCHEDULER_MATERIALIZE_BATCH, 100, 500),
        500
      )
    );
    const claimToken = randomUUID();
    const claimTokenHash = sha256(claimToken);
    const leaseSeconds = envInt(
      process.env.BULK_SCHEDULER_MATERIALIZE_LEASE_SECONDS,
      600,
      3_600
    );
    const claimed = await this._repository.claimDue({
      horizon: new Date(now.getTime() + horizonHours * 3_600_000),
      now,
      limit,
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
      claimTokenHash,
    });
    const outcomes: Array<{ jobId: string; state: string; code: string }> = [];
    for (const claimedJob of claimed) {
      const marked = await this._repository.markMaterializing({
        organizationId: claimedJob.organizationId,
        jobId: claimedJob.id,
        claimTokenHash,
        now,
      });
      if (marked.count !== 1) {
        outcomes.push({
          jobId: claimedJob.id,
          state: 'CLAIM_LOST',
          code: 'materializer_claim_lost',
        });
        continue;
      }
      const job = await this._repository.getJobContext(
        claimedJob.organizationId,
        claimedJob.id
      );
      if (!job) {
        outcomes.push({
          jobId: claimedJob.id,
          state: 'BLOCKED',
          code: 'campaign_job_not_found',
        });
        continue;
      }
      try {
        const decision = this.tupleGate({
          tupleId: job.capabilityTupleId,
          integrationId: job.integrationId,
        });
        if (!decision.eligible) {
          throw new UnprocessableEntityException({
            failureClass: 'user_action_needed',
            code: 'capability_tuple_disabled',
            reason: decision.reason,
          });
        }
        if (
          job.campaign.currentRevision !== job.intentRevision ||
          !['SCHEDULED', 'DISPATCHING'].includes(job.campaign.state) ||
          job.asset.state !== 'READY' ||
          job.asset.deletedAt ||
          job.integration.disabled ||
          job.integration.deletedAt ||
          !job.integration.token ||
          job.reservation?.state !== 'COMMITTED'
        ) {
          throw new ConflictException({
            failureClass: 'user_action_needed',
            code:
              job.integration.disabled ||
              job.integration.deletedAt ||
              !job.integration.token
                ? 'connection_disconnected'
                : 'dispatch_failed',
            reason:
              'The materializer recheck found stale campaign, asset, connection, or reservation state.',
          });
        }
        const prepared = this.rawPostBody(job);
        const validation = await this._posts.validatePosts(
          job.organizationId,
          prepared.body.posts
        );
        const invalid = validation.find(
          (item) =>
            !item.valid ||
            item.errors !== true ||
            item.emptyContent ||
            item.tooLong
        );
        if (invalid) {
          throw new UnprocessableEntityException({
            failureClass: 'data_problem',
            code:
              invalid.errors !== true ? 'invalid_media' : 'invalid_settings',
            reason:
              invalid.settingsError ||
              (invalid.errors !== true
                ? String(invalid.errors)
                : 'The platform settings are invalid.'),
          });
        }
        const mapped = await this._posts.mapTypeToPost(
          prepared.body,
          job.organizationId
        );
        (mapped.posts[0] as any).__publishlyTargetGroup = (
          prepared.body.posts[0] as any
        ).__publishlyTargetGroup;
        const created = await this._posts.createPost(
          job.organizationId,
          mapped,
          'API',
          false,
          true,
          {
            campaignReservation: {
              campaignJobId: job.id,
              reservationId: job.reservationId!,
              claimTokenHash,
            },
            beforeWorkflowStart: async ({ post, publishingJob }) => {
              const attached = await this._repository.attachMaterialized({
                organizationId: job.organizationId,
                jobId: job.id,
                claimTokenHash,
                postId: post.id,
                publishingJobId: publishingJob.id,
                now: new Date(),
              });
              if (attached.type !== 'attached') {
                throw new Error(`campaign_materialization_${attached.type}`);
              }
            },
          }
        );
        if (!created.some((item) => item.postId === prepared.postId)) {
          throw new Error('campaign_materialized_post_not_returned');
        }
        await this._repository.markCampaignDispatching({
          organizationId: job.organizationId,
          campaignId: job.campaignId,
        });
        outcomes.push({
          jobId: job.id,
          state: 'SCHEDULED',
          code: 'materialized_v109',
        });
      } catch (error) {
        const structured =
          error instanceof HttpException
            ? (error.getResponse() as Record<string, unknown>)
            : {};
        const failure = normalizePostFailure({
          error,
          code:
            typeof structured.code === 'string' ? structured.code : undefined,
          reason: structured.reason,
        });
        const issueCode: BulkCampaignIssueCode =
          structured.code === 'capability_tuple_disabled'
            ? 'capability_tuple_disabled'
            : structured.code === 'connection_disconnected'
            ? 'connection_disconnected'
            : failure.code === 'invalid_media'
            ? 'invalid_media'
            : failure.code === 'invalid_settings'
            ? 'invalid_settings'
            : /private.*media|provider_media/i.test(failure.reason)
            ? 'private_media_transport_failed'
            : 'materialization_failed';
        const targetState: BulkCampaignJobState =
          issueCode === 'invalid_media' || issueCode === 'invalid_settings'
            ? 'QUARANTINED'
            : failure.failureClass === 'recoverable'
            ? 'RETRYABLE_FAILURE'
            : 'BLOCKED';
        const outcomeClass = BULK_CAMPAIGN_ISSUE_CODES[issueCode].issueClass;
        await this._repository.markOutcome({
          organizationId: job.organizationId,
          jobId: job.id,
          from: ['MATERIALIZING'],
          to: targetState,
          outcomeClass,
          code: issueCode,
          reason: failure.reason,
        });
        await this.recordJobIssue({
          organizationId: job.organizationId,
          campaignId: job.campaignId,
          jobId: job.id,
          code: issueCode,
          reason: failure.reason,
        });
        outcomes.push({ jobId: job.id, state: targetState, code: issueCode });
      }
    }
    Sentry.metrics.count('bulk_campaign_materializer_claimed', claimed.length);
    this.logger.log({
      event: 'bulk_campaign_materializer_batch',
      claimed: claimed.length,
      outcomes: outcomes.reduce<Record<string, number>>((all, item) => {
        all[item.state] = (all[item.state] || 0) + 1;
        return all;
      }, {}),
    });
    return { claimed: claimed.length, outcomes };
  }

  async processCancellationBatch(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    limit?: number;
    now?: Date;
  }) {
    const now = input.now || new Date();
    const result = await this._repository.cancelCampaignBatch({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      limit: Math.max(1, Math.min(input.limit || 500, 500)),
      now,
    });
    if (result.type !== 'processed' || result.remaining > 0) return result;
    const campaign = await this._campaigns.get(
      input.organizationId,
      input.campaignId
    );
    if (campaign.state !== 'CANCELLING') return result;
    if (result.needsReview > 0) {
      await this._campaigns.recordIssue({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        eventKey: `cancellation-needs-review:${campaign.currentRevision}`,
        code: 'needs_review',
        reason: `${result.needsReview} item${
          result.needsReview === 1 ? '' : 's'
        } may already be dispatching and were preserved for operator review.`,
        subjectType: 'campaign',
        subjectId: input.campaignId,
        actor: {
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
        occurredAt: now,
      });
      await this._campaigns.transition({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        to: 'NEEDS_REVIEW',
        actor: {
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
        now,
      });
    } else {
      await this._campaigns.transition({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        to: 'CANCELLED',
        actor: {
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
        now,
      });
    }
    return result;
  }

  async cancel(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    idempotencyKey: unknown;
  }) {
    const begun = await this._campaigns.beginCancellation(input);
    if (begun.campaign.state === 'CANCELLED') return begun;
    const batch = await this.processCancellationBatch({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
    });
    return {
      campaign: await this._campaigns.get(
        input.organizationId,
        input.campaignId
      ),
      replayed: begun.replayed,
      batch,
    };
  }

  async processCancellations(limit = 10) {
    const campaigns = await this._repository.listCancellingCampaigns(limit);
    let processed = 0;
    for (const campaign of campaigns) {
      const result = await this.processCancellationBatch({
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
      });
      if (result.type === 'processed') processed += result.processed;
    }
    return { campaigns: campaigns.length, processed };
  }

  async runMaintenanceCycle() {
    const cancellations = await this.processCancellations();
    const materialization = await this.materializeDue({});
    return { cancellations, materialization };
  }

  async listJobs(input: {
    organizationId: string;
    campaignId: string;
    state?: string;
    cursor?: string;
    limit?: unknown;
  }) {
    await this._campaigns.get(input.organizationId, input.campaignId);
    if (
      input.state &&
      !BULK_CAMPAIGN_JOB_STATES.includes(input.state as BulkCampaignJobState)
    ) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_campaign_job_state',
        reason: 'The campaign job state filter is invalid.',
      });
    }
    let cursor = null;
    let limit: number;
    try {
      const decoded = decodeBulkCursor(input.cursor, 'job');
      cursor = decoded
        ? { createdAt: decoded.timestamp, id: decoded.id }
        : null;
      limit = bulkPageLimit(input.limit);
    } catch {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_cursor',
        reason: 'The campaign job cursor or limit is invalid.',
      });
    }
    const rows = await this._repository.listJobs({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      state: input.state as BulkCampaignJobState | undefined,
      cursor,
      limit,
    });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeBulkCursor({
              kind: 'job',
              timestamp: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }

  async setJobPinned(input: {
    organizationId: string;
    campaignId: string;
    jobId: string;
    expectedRevision: unknown;
    pinned: unknown;
    userId?: string;
  }) {
    if (
      !Number.isInteger(input.expectedRevision) ||
      (input.expectedRevision as number) < 1 ||
      typeof input.pinned !== 'boolean'
    ) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'campaign_job_pin_request_invalid',
        reason:
          'pinned must be boolean and expectedRevision must be a positive integer.',
      });
    }
    const result = await this._repository.setJobPinned({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      jobId: input.jobId,
      expectedRevision: input.expectedRevision as number,
      pinned: input.pinned,
      userId: input.userId,
      now: new Date(),
    });
    if (result.type === 'not_found') {
      throw new NotFoundException('Campaign job not found.');
    }
    if (result.type === 'published_immutable') {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'published_slot_immutable',
        reason:
          'A published slot remains permanently pinned to provider truth.',
      });
    }
    if (
      result.type === 'revision_conflict' ||
      result.type === 'revision_race'
    ) {
      throw new ConflictException({
        failureClass: 'recoverable',
        code: 'campaign_job_revision_conflict',
        reason:
          'The item changed concurrently. Reload it before changing its pin.',
        ...(result.type === 'revision_conflict'
          ? { currentRevision: result.currentRevision }
          : {}),
      });
    }
    if (result.type === 'reservation_unavailable') {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'calendar_reservation_not_committed',
        reason: 'Only a committed authoritative calendar slot can be pinned.',
      });
    }
    if (result.type === 'state_invalid') {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'campaign_job_pin_state_invalid',
        reason: `A ${result.state.toLowerCase()} item does not have a pinnable future slot.`,
      });
    }
    return { job: result.job, replayed: result.type === 'replay' };
  }

  async retryJob(input: {
    organizationId: string;
    campaignId: string;
    jobId: string;
    idempotencyKey: unknown;
    userId?: string;
  }) {
    if (!validateIdempotencyKey(input.idempotencyKey)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason:
          'Idempotency-Key must contain 8-200 letters, numbers, dots, underscores, colons, or hyphens.',
      });
    }
    const context = await this._repository.getJobContext(
      input.organizationId,
      input.jobId
    );
    if (!context || context.campaignId !== input.campaignId) {
      throw new NotFoundException('Campaign job not found.');
    }
    const tuple = this.tupleGate({
      tupleId: context.capabilityTupleId,
      integrationId: context.integrationId,
    });
    if (!tuple.eligible) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: tuple.code,
        reason: tuple.reason,
      });
    }
    const keyHash = sha256(
      `${input.organizationId}:${input.campaignId}:${input.jobId}:${input.idempotencyKey}`
    );
    const result = await this._repository.retryJob({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      jobId: input.jobId,
      operationId: `bulk_retry_audit_${keyHash.slice(0, 36)}`,
      userId: input.userId,
      now: new Date(),
    });
    if (result.type === 'not_found') {
      throw new NotFoundException('Campaign job not found.');
    }
    if (result.type === 'ambiguity_unresolved') {
      throw new ConflictException({
        failureClass: 'user_action_needed',
        code: 'provider_outcome_needs_review',
        reason:
          'A provider mutation may already have been accepted. Resolve its readback evidence; Publishly will not blindly repost.',
      });
    }
    if (result.type === 'connection_unavailable') {
      throw new ConflictException({
        failureClass: 'user_action_needed',
        code: 'connection_unavailable',
        reason: 'Reconnect this destination before retrying its item.',
      });
    }
    if (result.type === 'reservation_unavailable') {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'calendar_reservation_not_committed',
        reason:
          'This item has no committed authoritative slot. Replan it instead.',
      });
    }
    if (
      result.type === 'campaign_state_invalid' ||
      result.type === 'state_invalid' ||
      result.type === 'publishing_state_invalid'
    ) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'campaign_job_retry_state_invalid',
        reason: `The current ${result.state.toLowerCase()} state cannot be manually retried.`,
      });
    }
    Sentry.metrics.count(
      result.type === 'replay'
        ? 'bulk_campaign_job_retry_replayed'
        : 'bulk_campaign_job_retry_queued',
      1
    );
    return { job: result.job, replayed: result.type === 'replay' };
  }
}
