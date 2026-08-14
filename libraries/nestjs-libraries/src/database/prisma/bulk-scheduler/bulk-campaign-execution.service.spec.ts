jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class PostsService {},
  })
);

import { BulkCampaignExecutionService } from './bulk-campaign-execution.service';
import { BulkCampaignIntentV1 } from '@gitroom/helpers/bulk-scheduler/campaign.contract';
import { iterateBulkScheduleSlots } from '@gitroom/helpers/bulk-scheduler/execution.contract';

describe('BulkCampaignExecutionService lifecycle gates', () => {
  const makeService = (source: Record<string, unknown>) => {
    const repository = {
      getPlanningSource: jest.fn().mockResolvedValue(source),
    } as any;
    const campaigns = {
      transition: jest.fn(),
      assertDestinations: jest.fn().mockResolvedValue(undefined),
      recordIssue: jest.fn().mockResolvedValue({ type: 'created' }),
    } as any;
    const service = new BulkCampaignExecutionService(
      repository,
      campaigns,
      {} as any,
      {} as any
    );
    return { service, repository, campaigns };
  };

  it('does not move a paused campaign through upload/validation as a planning side effect', async () => {
    const { service, campaigns } = makeService({});
    await (service as any).progressToPlanning(
      'org-1',
      'campaign-1',
      'PAUSED',
      'user-1'
    );
    expect(campaigns.transition).not.toHaveBeenCalled();
  });

  it('requires an early-stage paused campaign to resume before planning', async () => {
    const { service } = makeService({
      id: 'campaign-1',
      organizationId: 'org-1',
      state: 'PAUSED',
      pausedFromState: 'VALIDATING',
      currentRevision: 1,
      intents: [],
      assets: [],
    });
    await expect(
      service.planAndReserve({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
      })
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'campaign_paused_before_scheduling',
      }),
    });
  });

  it('durably classifies an expansion over 100,000 before allocating jobs', async () => {
    const destinations = Array.from({ length: 100 }, (_, index) => ({
      integrationId: `integration-${index}`,
      capabilityTupleId: 'instagram.professional.reel.video',
    }));
    const intent: BulkCampaignIntentV1 = {
      schemaVersion: 1,
      selection: { destinations },
      distribution: { mode: 'cross_post' },
      cadence: { scope: 'campaign', postsPerDay: 100 },
      schedule: {
        startDate: '2026-09-01',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        timezone: 'UTC',
        windowStart: '00:00',
        windowEnd: '23:59',
        spacingMinutes: 1,
        slotStrategy: 'even',
        conflictBehavior: 'next_available',
      },
      ordering: { mode: 'upload' },
    };
    const { service, campaigns } = makeService({
      id: 'campaign-1',
      organizationId: 'org-1',
      state: 'DRAFT',
      pausedFromState: null,
      currentRevision: 1,
      intents: [{ revision: 1, intent }],
      assets: Array.from({ length: 1_001 }, (_, position) => ({
        position,
        pinned: false,
        asset: {
          id: `asset-${position}`,
          originalName: `${position}.mp4`,
          state: 'READY',
          deletedAt: null,
        },
      })),
    });

    await expect(
      service.planAndReserve({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
      })
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'campaign_expansion_limit_exceeded',
        expandedJobCount: 100_100,
        maximumExpandedJobs: 100_000,
      }),
    });
    expect(campaigns.recordIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'campaign_overflow',
        eventKey: 'campaign-overflow:1:100100',
        details: expect.objectContaining({ expandedJobCount: 100_100 }),
      })
    );
  });

  it('reserves large revisions through bounded keyset pages', async () => {
    const intent: BulkCampaignIntentV1 = {
      schemaVersion: 1,
      selection: {
        destinations: [
          {
            integrationId: 'integration-1',
            capabilityTupleId: 'instagram.professional.reel.video',
          },
        ],
      },
      distribution: { mode: 'cross_post' },
      cadence: { scope: 'per_account', postsPerDay: 100 },
      schedule: {
        startDate: '2026-09-01',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        timezone: 'UTC',
        windowStart: '00:00',
        windowEnd: '23:59',
        spacingMinutes: 1,
        slotStrategy: 'even',
        conflictBehavior: 'next_available',
      },
      ordering: { mode: 'upload' },
      publication: { caption: '' },
    };
    const slots = iterateBulkScheduleSlots(intent);
    const jobs = Array.from({ length: 501 }, (_, ordinal) => ({
      id: `job-${ordinal}`,
      ordinal,
      state: 'PLANNED',
      integrationId: 'integration-1',
      pinned: false,
      scheduledAt: slots.next().value!.scheduledAt,
    }));
    const repository = {
      listRevisionIntegrationIds: jest
        .fn()
        .mockResolvedValue([{ integrationId: 'integration-1' }]),
      listRevisionJobsPage: jest.fn((input) =>
        Promise.resolve(
          jobs
            .filter((job) =>
              input.afterOrdinal === undefined
                ? true
                : job.ordinal > input.afterOrdinal
            )
            .slice(0, input.limit)
        )
      ),
      beginReservation: jest.fn().mockResolvedValue(true),
      beginReservationBatch: jest.fn((input) =>
        Promise.resolve(input.jobIds.length)
      ),
      linkReservation: jest.fn().mockResolvedValue(true),
      linkReservationBatch: jest.fn((input) =>
        Promise.resolve(input.rows.length)
      ),
      recordJobIssue: jest.fn(),
    } as any;
    const reservations = {
      resolveWriterMode: jest.fn().mockResolvedValue('AUTHORITATIVE'),
      acquire: jest.fn(),
      acquireBatch: jest.fn((inputs) =>
        Promise.resolve(
          inputs.map((input) => ({
            conflicted: false,
            replayed: false,
            reservation: {
              id: `reservation-${input.ownerId}`,
              outcomeReason: 'reserved',
            },
          }))
        )
      ),
    } as any;
    const service = new BulkCampaignExecutionService(
      repository,
      {} as any,
      reservations,
      {} as any
    );
    await (service as any).reserveRevision({
      organizationId: 'org-1',
      campaignId: 'campaign-1',
      intentRevision: 1,
      intent,
    });
    expect(repository.listRevisionJobsPage).toHaveBeenCalledTimes(2);
    expect(repository.listRevisionJobsPage.mock.calls[0][0]).toMatchObject({
      limit: 500,
      afterOrdinal: undefined,
    });
    expect(repository.listRevisionJobsPage.mock.calls[1][0]).toMatchObject({
      limit: 500,
      afterOrdinal: 499,
    });
    expect(reservations.acquireBatch).toHaveBeenCalledTimes(2);
    expect(
      reservations.acquireBatch.mock.calls.reduce(
        (count, [batch]) => count + batch.length,
        0
      )
    ).toBe(501);
  });
});
