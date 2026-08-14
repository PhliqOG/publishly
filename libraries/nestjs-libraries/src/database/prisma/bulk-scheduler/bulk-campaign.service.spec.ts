import { HttpException, NotFoundException } from '@nestjs/common';
import * as capabilityMatrix from '@gitroom/helpers/bulk-scheduler/capability.matrix';
import { BulkCampaignService } from './bulk-campaign.service';

const intent = {
  schemaVersion: 1 as const,
  selection: {
    destinations: [
      {
        integrationId: 'integration-1',
        capabilityTupleId: 'instagram.professional.reel.video',
      },
    ],
  },
  distribution: { mode: 'cross_post' as const },
  cadence: { scope: 'per_account' as const, postsPerDay: 3 },
  schedule: {
    startDate: '2026-08-13',
    weekdays: [1, 2, 3, 4, 5],
    timezone: 'America/New_York',
    windowStart: '09:00',
    windowEnd: '17:00',
    spacingMinutes: 60,
    slotStrategy: 'even' as const,
    conflictBehavior: 'next_available' as const,
  },
  ordering: { mode: 'upload' as const },
};

describe('BulkCampaignService', () => {
  let repository: any;
  let service: BulkCampaignService;

  beforeEach(() => {
    repository = {
      findConnections: jest.fn().mockResolvedValue([
        {
          id: 'integration-1',
          organizationId: 'org-1',
          providerIdentifier: 'instagram',
          disabled: false,
          token: 'encrypted-token',
          deletedAt: null,
        },
      ]),
      create: jest.fn(),
      get: jest.fn(),
      revise: jest.fn(),
      list: jest.fn(),
      listIntents: jest.fn(),
      listIssues: jest.fn(),
      transition: jest.fn(),
      getActionReplay: jest.fn().mockResolvedValue(null),
      recordActionNoop: jest.fn().mockResolvedValue(true),
      recordIssue: jest.fn(),
      resolveIssue: jest.fn(),
    };
    service = new BulkCampaignService(repository);
  });

  afterEach(() => jest.restoreAllMocks());

  it('fails closed with an explicit item outcome while the exact tuple is uncertified', async () => {
    await expect(
      service.create({
        organizationId: 'org-1',
        userId: 'user-1',
        name: 'Launch batch',
        rawIntent: intent,
        idempotencyKey: 'campaign-key-1',
      })
    ).rejects.toMatchObject({ status: 422 });

    try {
      await service.create({
        organizationId: 'org-1',
        userId: 'user-1',
        name: 'Launch batch',
        rawIntent: intent,
        idempotencyKey: 'campaign-key-2',
      });
    } catch (error) {
      expect((error as HttpException).getResponse()).toMatchObject({
        failureClass: 'user_action_needed',
        code: 'campaign_destinations_blocked',
        issues: [
          expect.objectContaining({
            integrationId: 'integration-1',
            capabilityTupleId: 'instagram.professional.reel.video',
            issueClass: 'blocked',
            code: 'capability_tuple_disabled',
            reason: expect.any(String),
          }),
        ],
      });
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects malformed intent before any repository lookup', async () => {
    await expect(
      service.create({
        organizationId: 'org-1',
        name: 'Broken',
        rawIntent: { schemaVersion: 1 },
        idempotencyKey: 'campaign-key-1',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.findConnections).not.toHaveBeenCalled();
  });

  it('creates and replays one campaign when an exact tuple is eligible', async () => {
    const tuple = capabilityMatrix.findBulkSchedulerTuple(
      'instagram.professional.reel.video'
    )!;
    jest
      .spyOn(capabilityMatrix, 'bulkTupleDecisionForIntegration')
      .mockReturnValue({
        eligible: true,
        code: 'eligible',
        reason: 'Certified.',
        tuple,
      });
    repository.create.mockResolvedValue({
      created: true,
      campaign: {
        id: 'campaign-1',
        requestHash: 'request-hash-from-repository',
      },
    });
    repository.get.mockResolvedValue({
      id: 'campaign-1',
      organizationId: 'org-1',
      currentRevision: 1,
      intent: { revision: 1, intent },
    });

    await expect(
      service.create({
        organizationId: 'org-1',
        userId: 'user-1',
        name: ' Launch batch ',
        rawIntent: intent,
        idempotencyKey: 'campaign-key-1',
      })
    ).resolves.toMatchObject({
      id: 'campaign-1',
      organizationId: 'org-1',
      replayed: false,
    });
    expect(repository.findConnections).toHaveBeenCalledWith('org-1', [
      'integration-1',
    ]);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        name: 'Launch batch',
        id: expect.stringMatching(/^bulk_campaign_/),
        intentId: expect.stringMatching(/^bulk_intent_/),
        idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );
  });

  it('does not share tenant scope between concurrent destination validation', async () => {
    const tuple = capabilityMatrix.findBulkSchedulerTuple(
      'instagram.professional.reel.video'
    )!;
    jest
      .spyOn(capabilityMatrix, 'bulkTupleDecisionForIntegration')
      .mockReturnValue({ eligible: true, code: 'eligible', reason: 'Certified.', tuple });
    repository.findConnections.mockImplementation(async (organizationId: string) => [
      {
        id: 'integration-1',
        organizationId,
        providerIdentifier: 'instagram',
        disabled: false,
        token: 'encrypted-token',
      },
    ]);
    repository.create.mockImplementation(async (input: any) => ({
      created: true,
      campaign: { id: input.id, requestHash: input.requestHash },
    }));
    repository.get.mockImplementation(async (organizationId: string, id: string) => ({
      id,
      organizationId,
      currentRevision: 1,
      intent: { revision: 1, intent },
    }));

    const [first, second] = await Promise.all([
      service.create({
        organizationId: 'org-a',
        name: 'A',
        rawIntent: intent,
        idempotencyKey: 'campaign-a',
      }),
      service.create({
        organizationId: 'org-b',
        name: 'B',
        rawIntent: intent,
        idempotencyKey: 'campaign-b',
      }),
    ]);
    expect(first.organizationId).toBe('org-a');
    expect(second.organizationId).toBe('org-b');
    expect(repository.findConnections.mock.calls).toEqual(
      expect.arrayContaining([
        ['org-a', ['integration-1']],
        ['org-b', ['integration-1']],
      ])
    );
  });

  it('derives issue class/taxonomy from the stable registry instead of trusting callers', async () => {
    repository.recordIssue.mockImplementation(async (input: any) => input);
    await expect(
      service.recordIssue({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        eventKey: 'asset-1:validate',
        code: 'invalid_media',
        reason: 'Unsupported codec.',
        subjectType: 'asset',
        subjectId: 'asset-1',
      })
    ).resolves.toMatchObject({
      organizationId: 'org-1',
      campaignId: 'campaign-1',
      issueClass: 'quarantined',
      failureClass: 'data_problem',
      code: 'invalid_media',
      reason: 'Unsupported codec.',
      retryable: false,
    });
    expect(() =>
      service.recordIssue({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        eventKey: 'x',
        code: 'invented_code',
        reason: 'No.',
      })
    ).toThrow(/Unknown Bulk Scheduler issue code/);
  });

  it('returns the same not-found result for another tenant campaign ID', async () => {
    repository.get.mockResolvedValue(null);
    await expect(service.get('org-b', 'campaign-from-org-a')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(repository.get).toHaveBeenCalledWith('org-b', 'campaign-from-org-a');
  });

  it('produces bounded continuation cursors without leaking another page', async () => {
    repository.list.mockResolvedValue({
      items: [
        {
          id: 'campaign-2',
          organizationId: 'org-1',
          updatedAt: new Date('2026-08-12T20:00:00Z'),
        },
      ],
      hasMore: true,
    });
    const page = await service.list({ organizationId: 'org-1', limit: '1' });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', limit: 1, cursor: null })
    );
  });

  it('persists a paused no-op so an old idempotency key cannot pause again after resume', async () => {
    const paused = {
      id: 'campaign-1',
      organizationId: 'org-1',
      state: 'PAUSED',
      pausedFromState: 'SCHEDULED',
    };
    repository.get.mockResolvedValue(paused);

    await expect(
      service.pause({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        userId: 'user-1',
        idempotencyKey: 'pause-request-1',
      })
    ).resolves.toEqual({ campaign: paused, replayed: true });
    expect(repository.recordActionNoop).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        action: 'pause',
        state: 'PAUSED',
        operationId: expect.stringMatching(/^bulk_action_/),
      })
    );

    repository.getActionReplay.mockResolvedValue({ id: 'recorded' });
    repository.get.mockResolvedValue({ ...paused, state: 'SCHEDULED' });
    await expect(
      service.pause({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        userId: 'user-1',
        idempotencyKey: 'pause-request-1',
      })
    ).resolves.toMatchObject({
      campaign: { state: 'SCHEDULED' },
      replayed: true,
    });
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('resumes to the exact state captured when the campaign was paused', async () => {
    repository.get.mockResolvedValue({
      id: 'campaign-1',
      organizationId: 'org-1',
      state: 'PAUSED',
      pausedFromState: 'DISPATCHING',
    });
    repository.transition.mockResolvedValue({
      id: 'campaign-1',
      organizationId: 'org-1',
      state: 'DISPATCHING',
      pausedFromState: null,
    });

    await expect(
      service.resume({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        userId: 'user-1',
        idempotencyKey: 'resume-request-1',
      })
    ).resolves.toMatchObject({ campaign: { state: 'DISPATCHING' } });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'PAUSED',
        to: 'DISPATCHING',
      })
    );
  });

  it('rejects lifecycle actions without a valid idempotency key', async () => {
    await expect(
      service.beginCancellation({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        idempotencyKey: 'short',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.get).not.toHaveBeenCalled();
  });
});
