import { FleetHealthService } from './fleet-health.service';

const now = new Date('2026-08-10T12:00:00.000Z');

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    internalId: 'page-1',
    name: 'Main Page',
    picture: null,
    providerIdentifier: 'facebook',
    disabled: false,
    refreshNeeded: false,
    tokenExpiration: new Date('2026-09-01T12:00:00.000Z'),
    tokenHealthState: 'EXPIRING',
    tokenHealthReason: 'The token expires in 22 days.',
    connectionHealthState: 'HEALTHY',
    connectionHealthReason: 'The connection is healthy.',
    lastProviderContactAt: new Date('2026-08-09T12:00:00.000Z'),
    lastSuccessfulPublishAt: new Date('2026-08-09T11:00:00.000Z'),
    lastFailedPublishAt: null,
    consecutiveErrors: 0,
    staleSince: null,
    deadAccountAt: null,
    rateLimitedUntil: null,
    accountGroups: [
      {
        accountGroup: {
          id: 'group-1',
          name: 'East Coast',
          color: '#22AA88',
        },
      },
    ],
    accountTags: [
      {
        accountTag: { id: 'tag-1', name: 'Priority', color: '#AA44FF' },
      },
    ],
    ...overrides,
  } as any;
}

describe('FleetHealthService', () => {
  let repository: {
    listConnections: jest.Mock;
    listFacets: jest.Mock;
    aggregateTerminalOutcomes: jest.Mock;
    aggregateQueue: jest.Mock;
    listReconnectCandidates: jest.Mock;
    createTag: jest.Mock;
    createGroup: jest.Mock;
    updateTag: jest.Mock;
    updateGroup: jest.Mock;
    archiveTag: jest.Mock;
    archiveGroup: jest.Mock;
    assignTag: jest.Mock;
    assignGroup: jest.Mock;
  };
  let service: FleetHealthService;

  beforeEach(() => {
    repository = {
      listConnections: jest.fn().mockResolvedValue([connection()]),
      listFacets: jest.fn().mockResolvedValue({
        groups: [{ id: 'group-1', name: 'East Coast' }],
        tags: [{ id: 'tag-1', name: 'Priority', color: '#AA44FF' }],
      }),
      aggregateTerminalOutcomes: jest.fn().mockResolvedValue([
        {
          integrationId: 'integration-1',
          state: 'PUBLISHED',
          deliveryStage: 'confirmed_live',
          _count: { _all: 8 },
          _sum: { attempts: 10 },
        },
        {
          integrationId: 'integration-1',
          state: 'FAILED',
          deliveryStage: 'failed',
          _count: { _all: 2 },
          _sum: { attempts: 3 },
        },
      ]),
      aggregateQueue: jest.fn().mockResolvedValue([
        {
          integrationId: 'integration-1',
          _count: { _all: 4 },
          _min: { createdAt: new Date('2026-08-10T10:00:00.000Z') },
        },
      ]),
      listReconnectCandidates: jest.fn().mockResolvedValue([]),
      createTag: jest.fn().mockResolvedValue({
        id: 'tag-1',
        name: 'Priority',
        color: '#AA44FF',
      }),
      createGroup: jest.fn().mockResolvedValue({
        id: 'group-1',
        name: 'East Coast',
        color: '#22AA88',
      }),
      updateTag: jest.fn(),
      updateGroup: jest.fn(),
      archiveTag: jest.fn(),
      archiveGroup: jest.fn(),
      assignTag: jest.fn(),
      assignGroup: jest.fn(),
    };
    service = new FleetHealthService(repository as any);
  });

  it('computes confirmed-only success, retries, queue age, and safe facets', async () => {
    const result = await service.getFleetHealth(
      'org-1',
      { windowDays: '30', groupId: 'group-1', tagId: 'tag-1' },
      now
    );

    expect(repository.listConnections).toHaveBeenCalledWith('org-1', {
      groupId: 'group-1',
      tagId: 'tag-1',
    });
    expect(repository.aggregateTerminalOutcomes).toHaveBeenCalledWith(
      'org-1',
      ['integration-1'],
      new Date('2026-07-11T12:00:00.000Z')
    );
    expect(result.rows[0]).toMatchObject({
      id: 'integration-1',
      provider: 'facebook',
      healthColor: 'yellow',
      healthReason: 'The token expires in 22 days.',
      tokenDaysRemaining: 22,
      group: { id: 'group-1', name: 'East Coast' },
      groups: [{ id: 'group-1', name: 'East Coast', color: '#22AA88' }],
      tags: [{ id: 'tag-1', name: 'Priority', color: '#AA44FF' }],
      metrics: {
        confirmedLive: 8,
        failed: 2,
        terminal: 10,
        successRate: 80,
        retries: 3,
        queued: 4,
        oldestQueuedAt: new Date('2026-08-10T10:00:00.000Z'),
      },
    });
    expect(result.summary).toMatchObject({
      total: 1,
      yellow: 1,
      confirmedLive: 8,
      failed: 2,
      successRate: 80,
    });
  });

  it('returns null success for no terminal evidence and applies red precedence/color filtering', async () => {
    repository.listConnections.mockResolvedValue([
      connection({
        id: 'red-1',
        tokenHealthState: 'EXPIRING',
        connectionHealthState: 'DEAD',
        connectionHealthReason: 'Three consecutive provider errors.',
        accountTags: [],
      }),
      connection({
        id: 'green-1',
        tokenHealthState: 'HEALTHY',
        connectionHealthState: 'HEALTHY',
        accountTags: [],
      }),
    ]);
    repository.aggregateTerminalOutcomes.mockResolvedValue([]);
    repository.aggregateQueue.mockResolvedValue([]);

    const result = await service.getFleetHealth('org-1', { color: 'red' }, now);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'red-1',
      healthColor: 'red',
      metrics: { terminal: 0, successRate: null },
    });
    expect(result.summary).toMatchObject({
      total: 1,
      red: 1,
      successRate: null,
    });
  });

  it('surfaces aggregation failure instead of returning apparently healthy rows', async () => {
    repository.aggregateTerminalOutcomes.mockRejectedValue(
      new Error('publishing ledger unavailable')
    );

    await expect(service.getFleetHealth('org-1', {}, now)).rejects.toThrow(
      'publishing ledger unavailable'
    );
  });

  it('builds an ordered reconnect plan without exposing cross-tenant rows', async () => {
    repository.listReconnectCandidates.mockResolvedValue([
      {
        id: 'owned-2',
        internalId: 'page-2',
        name: 'Disabled Page',
        providerIdentifier: 'facebook',
        disabled: true,
        tokenHealthState: 'EXPIRED',
        connectionHealthState: 'DISABLED',
      },
      {
        id: 'owned-1',
        internalId: 'page-1',
        name: 'Main Page',
        providerIdentifier: 'facebook',
        disabled: false,
        tokenHealthState: 'EXPIRED',
        connectionHealthState: 'RECONNECT_REQUIRED',
      },
    ]);

    const result = await service.buildReconnectPlan('org-1', [
      'owned-1',
      'foreign-or-missing',
      'owned-2',
      'owned-1',
    ]);

    expect(repository.listReconnectCandidates).toHaveBeenCalledWith('org-1', [
      'owned-1',
      'foreign-or-missing',
      'owned-2',
    ]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        integrationId: 'owned-1',
        internalId: 'page-1',
      }),
    ]);
    expect(result.rejected).toEqual([
      expect.objectContaining({
        integrationId: 'foreign-or-missing',
        code: 'connection_not_found',
        reason: expect.any(String),
      }),
      expect.objectContaining({
        integrationId: 'owned-2',
        code: 'connection_disabled',
        reason: expect.any(String),
      }),
    ]);
  });

  it('rejects empty and oversized reconnect selections with a classified reason', async () => {
    await expect(service.buildReconnectPlan('org-1', [])).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: 'invalid_reconnect_selection',
          reason: expect.any(String),
        }),
      }
    );
    await expect(
      service.buildReconnectPlan(
        'org-1',
        Array.from({ length: 501 }, (_, index) => `connection-${index}`)
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'invalid_reconnect_selection',
      }),
    });
    expect(repository.listReconnectCandidates).not.toHaveBeenCalled();
  });

  it('builds ordered standard-OAuth connect actions and classifies unsupported providers', () => {
    const result = service.buildConnectPlan(
      [
        { provider: 'facebook', count: 2 },
        { provider: 'mastodon', count: 1 },
        { provider: 'skool', count: 1 },
        { provider: 'bluesky', count: 1 },
        { provider: 'x', count: 1 },
        { provider: 'missing', count: 1 },
      ],
      [
        { identifier: 'facebook', name: 'Facebook', configured: true },
        {
          identifier: 'mastodon',
          name: 'Mastodon',
          configured: true,
          isExternal: true,
        },
        {
          identifier: 'skool',
          name: 'Skool',
          configured: true,
          isChromeExtension: true,
        },
        {
          identifier: 'bluesky',
          name: 'Bluesky',
          configured: true,
          customFields: [],
        },
        { identifier: 'x', name: 'X', configured: false },
      ]
    );

    expect(result.requested).toBe(7);
    expect(result.actions).toEqual([
      {
        actionId: 'facebook:1',
        provider: 'facebook',
        providerName: 'Facebook',
        ordinal: 1,
      },
      {
        actionId: 'facebook:2',
        provider: 'facebook',
        providerName: 'Facebook',
        ordinal: 2,
      },
    ]);
    expect(result.rejected).toEqual([
      expect.objectContaining({
        provider: 'mastodon',
        code: 'external_details_required',
        reason: expect.any(String),
      }),
      expect.objectContaining({
        provider: 'skool',
        code: 'extension_required',
      }),
      expect.objectContaining({
        provider: 'bluesky',
        code: 'credentials_required',
      }),
      expect.objectContaining({
        provider: 'x',
        code: 'provider_not_configured',
      }),
      expect.objectContaining({
        provider: 'missing',
        code: 'provider_not_found',
      }),
    ]);
  });

  it('rejects duplicate, malformed, empty, and oversized bulk-connect plans', () => {
    const catalog = [
      { identifier: 'facebook', name: 'Facebook', configured: true },
    ];
    for (const providers of [
      [],
      [{ provider: 'facebook', count: 0 }],
      [
        { provider: 'facebook', count: 1 },
        { provider: 'facebook', count: 1 },
      ],
      [
        { provider: 'facebook', count: 500 },
        { provider: 'x', count: 1 },
      ],
    ]) {
      expect(() => service.buildConnectPlan(providers, catalog)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'invalid_bulk_connect_selection',
            reason: expect.any(String),
          }),
        })
      );
    }
  });

  it('normalizes tag creation and enforces tenant-owned assignment results', async () => {
    await service.createTag('org-1', {
      name: '  Priority   Fleet ',
      color: '#aa44ff',
    });
    expect(repository.createTag).toHaveBeenCalledWith({
      organizationId: 'org-1',
      name: 'Priority Fleet',
      normalizedName: 'priority fleet',
      color: '#AA44FF',
    });

    repository.assignTag.mockResolvedValueOnce({
      ok: false,
      code: 'connection_not_found',
    });
    await expect(
      service.assignTag('org-1', 'tag-1', {
        integrationIds: ['owned-1', 'foreign-1'],
        mode: 'add',
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'connection_not_found',
        reason: expect.any(String),
      }),
    });

    repository.assignTag.mockResolvedValueOnce({
      ok: true,
      tag: { id: 'tag-1' },
      mode: 'add',
      affected: 1,
      requested: 1,
    });
    await expect(
      service.assignTag('org-1', 'tag-1', {
        integrationIds: ['owned-1'],
        mode: 'add',
      })
    ).resolves.toMatchObject({ ok: true, requested: 1 });
  });

  it('rejects empty tag names, invalid modes, and oversized tag selections', async () => {
    try {
      service.createTag('org-1', { name: ' ' });
      throw new Error('Expected invalid account tag to be rejected');
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          code: 'invalid_account_tag',
          reason: expect.stringMatching(/tag name must contain/i),
        }),
      });
    }
    await expect(
      service.assignTag('org-1', 'tag-1', {
        integrationIds: ['owned-1'],
        mode: 'replace',
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'invalid_tag_mode' }),
    });
    await expect(
      service.assignTag('org-1', 'tag-1', {
        integrationIds: Array.from(
          { length: 501 },
          (_, index) => `connection-${index}`
        ),
        mode: 'add',
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'invalid_tag_selection' }),
    });
  });

  it('normalizes group creation and enforces atomic group assignments', async () => {
    await service.createGroup('org-1', {
      name: '  East   Coast ',
      color: '#22aa88',
    });
    expect(repository.createGroup).toHaveBeenCalledWith({
      organizationId: 'org-1',
      name: 'East Coast',
      normalizedName: 'east coast',
      color: '#22AA88',
    });

    repository.assignGroup.mockResolvedValueOnce({
      ok: false,
      code: 'connection_not_found',
    });
    await expect(
      service.assignGroup('org-1', 'group-1', {
        integrationIds: ['owned-1', 'foreign-1'],
        mode: 'add',
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'connection_not_found',
        reason: expect.any(String),
      }),
    });

    repository.assignGroup.mockResolvedValueOnce({
      ok: true,
      group: { id: 'group-1' },
      mode: 'add',
      affected: 1,
      requested: 1,
    });
    await expect(
      service.assignGroup('org-1', 'group-1', {
        integrationIds: ['owned-1'],
        mode: 'add',
      })
    ).resolves.toMatchObject({ ok: true, requested: 1 });
  });

  it('classifies update conflicts and missing archive targets', async () => {
    repository.updateTag.mockResolvedValue({
      ok: false,
      code: 'account_tag_conflict',
    });
    await expect(
      service.updateTag('org-1', 'tag-1', {
        name: 'Priority',
        color: '#AA44FF',
      })
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'account_tag_conflict',
        reason: expect.any(String),
      }),
    });

    repository.updateGroup.mockResolvedValue({
      ok: false,
      code: 'account_group_not_found',
    });
    await expect(
      service.updateGroup('org-1', 'group-1', {
        name: 'East Coast',
        color: '#22AA88',
      })
    ).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: 'account_group_not_found',
        reason: expect.any(String),
      }),
    });

    repository.archiveTag.mockResolvedValue({ count: 0 });
    await expect(
      service.archiveTag('org-1', 'foreign-tag', now)
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'account_tag_not_found',
        reason: expect.any(String),
      }),
    });
  });
});
