import { FleetDistributionService } from './fleet-distribution.service';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);

const now = new Date('2026-08-10T12:00:00.000Z');

const connections = [
  {
    id: 'connection-b',
    organizationId: 'org-1',
    name: 'Brand B',
    providerIdentifier: 'facebook',
    disabled: false,
    deletedAt: null,
  },
  {
    id: 'connection-a',
    organizationId: 'org-1',
    name: 'Brand A',
    providerIdentifier: 'instagram',
    disabled: false,
    deletedAt: null,
  },
];

const input = {
  accountGroupId: 'group-1',
  windowStart: '2026-08-10T13:00:00.000Z',
  windowEnd: '2026-08-10T14:00:00.000Z',
  timezone: 'America/New_York',
  minimumSpacingSeconds: 60,
  shortLink: false,
  tags: [],
  value: [{ content: 'Shared fleet post', image: [] }],
  settingsByProvider: { facebook: {}, instagram: {} },
};

function setup() {
  const repository = {
    findByKey: jest.fn().mockResolvedValue(null),
    getActiveGroup: jest.fn().mockResolvedValue({
      id: 'group-1',
      name: 'East Coast',
      color: '#3B82F6',
      integrations: connections.map((integration) => ({ integration })),
    }),
    listExistingSlots: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    resume: jest.fn(),
    markItemCreated: jest.fn().mockResolvedValue({ count: 1 }),
    recordFailure: jest.fn(),
    complete: jest.fn().mockResolvedValue({ completed: true, remaining: 0 }),
  };
  const posts = {
    validatePosts: jest.fn().mockImplementation((_org, rawPosts) =>
      rawPosts.map((post: any) => {
        const connection = connections.find(
          (item) => item.id === post.integration.id
        )!;
        return {
          id: connection.id,
          identifier: connection.providerIdentifier,
          name: connection.name,
          valid: true,
          settingsError: '',
          errors: true,
          emptyContent: false,
          tooLong: false,
        };
      })
    ),
    mapTypeToPost: jest.fn().mockImplementation(async (body) => body),
    createPost: jest.fn().mockImplementation(async (_org, body) => [
      {
        postId: body.posts[0].value[0].id,
        integration: body.posts[0].integration.id,
      },
    ]),
  };
  repository.create.mockImplementation(async (claim) => {
    const byId = new Map(
      connections.map((connection) => [connection.id, connection])
    );
    return {
      created: true,
      distribution: {
        id: claim.id,
        requestHash: claim.requestHash,
        state: 'IN_PROGRESS',
        windowStart: claim.windowStart,
        windowEnd: claim.windowEnd,
        timezone: claim.timezone,
        minimumSpacingSec: claim.minimumSpacingSec,
        accountGroup: {
          id: 'group-1',
          name: 'East Coast',
          color: '#3B82F6',
        },
        items: claim.items.map((item: any) => ({
          ...item,
          status: 'ALLOCATED',
          integration: byId.get(item.integrationId),
        })),
      },
    };
  });
  return {
    service: new FleetDistributionService(repository as any, posts as any),
    repository,
    posts,
  };
}

describe('FleetDistributionService', () => {
  it('preflights every account before the ledger, then creates distinct deterministic posts', async () => {
    const { service, repository, posts } = setup();
    const result = await service.create(
      'org-1',
      'fleet-campaign-001',
      input,
      now
    );

    expect(result).toMatchObject({
      state: 'COMPLETED',
      replayed: false,
      accountGroup: { id: 'group-1' },
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].integrationId).toBe('connection-a');
    expect(result.items[1].integrationId).toBe('connection-b');
    expect(new Date(result.items[0].scheduledAt).getTime()).toBeLessThan(
      new Date(result.items[1].scheduledAt).getTime()
    );
    expect(posts.validatePosts).toHaveBeenCalledTimes(1);
    expect(posts.validatePosts.mock.invocationCallOrder[0]).toBeLessThan(
      repository.create.mock.invocationCallOrder[0]
    );
    expect(posts.createPost).toHaveBeenCalledTimes(2);
    for (const call of posts.createPost.mock.calls) {
      expect(call[4]).toBe(true);
      expect(call[1].posts[0].__publishlyTargetGroup).toMatch(/^fleet_group_/);
    }
    expect(repository.complete).toHaveBeenCalled();
  });

  it('rejects any bad destination during preflight without writing a ledger or post', async () => {
    const { service, repository, posts } = setup();
    posts.validatePosts.mockResolvedValue([
      {
        id: 'connection-a',
        identifier: 'instagram',
        name: 'Brand A',
        valid: true,
        settingsError: '',
        errors: 'Instagram video aspect ratio is invalid.',
        emptyContent: false,
        tooLong: false,
      },
      {
        id: 'connection-b',
        identifier: 'facebook',
        name: 'Brand B',
        valid: true,
        settingsError: '',
        errors: true,
        emptyContent: false,
        tooLong: false,
      },
    ]);
    await expect(
      service.create('org-1', 'fleet-campaign-002', input, now)
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        failureClass: 'data_problem',
        code: 'invalid_media',
        reason: 'Instagram video aspect ratio is invalid.',
      }),
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('replays a completed key and rejects a key reused for different content', async () => {
    const replay = setup();
    const first = await replay.service.create(
      'org-1',
      'fleet-campaign-003',
      input,
      now
    );
    const distribution = replay.repository.create.mock.results[0].value;
    const claimed = (await distribution).distribution;
    claimed.state = 'COMPLETED';

    const replaySetup = setup();
    replaySetup.repository.findByKey.mockResolvedValue(claimed);
    await expect(
      replaySetup.service.create('org-1', 'fleet-campaign-003', input, now)
    ).resolves.toMatchObject({ replayed: true });
    expect(replaySetup.posts.validatePosts).not.toHaveBeenCalled();
    expect(replaySetup.posts.createPost).not.toHaveBeenCalled();

    const mismatch = setup();
    mismatch.repository.findByKey.mockResolvedValue({
      ...claimed,
      requestHash: 'different-request-hash',
    });
    await expect(
      mismatch.service.create('org-1', 'fleet-campaign-003', input, now)
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'idempotency_key_reused',
        reason: expect.any(String),
      }),
    });
  });

  it('records partial infrastructure failure and resumes only uncreated items', async () => {
    const first = setup();
    first.posts.createPost
      .mockImplementationOnce(async (_org, body) => [
        { postId: body.posts[0].value[0].id },
      ])
      .mockRejectedValueOnce(new Error('ECONNRESET before provider request'));
    await expect(
      first.service.create('org-1', 'fleet-campaign-004', input, now)
    ).rejects.toMatchObject({ status: 503 });
    expect(first.repository.markItemCreated).toHaveBeenCalledTimes(1);
    expect(first.repository.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: expect.any(String),
        failureClass: 'recoverable',
        code: 'network_error',
        reason: expect.any(String),
      })
    );

    const claimed = (await first.repository.create.mock.results[0].value)
      .distribution;
    claimed.state = 'FAILED';
    claimed.items[0].status = 'CREATED';
    claimed.items[1].status = 'ALLOCATED';
    const retry = setup();
    retry.repository.findByKey.mockResolvedValue(claimed);
    await expect(
      retry.service.create('org-1', 'fleet-campaign-004', input, now)
    ).resolves.toMatchObject({ state: 'COMPLETED' });
    expect(retry.repository.resume).toHaveBeenCalledWith(claimed.id);
    expect(retry.posts.createPost).toHaveBeenCalledTimes(1);
    expect(
      retry.posts.createPost.mock.calls[0][1].posts[0].integration.id
    ).toBe(claimed.items[1].integrationId);
  });

  it('classifies disabled group members before allocation', async () => {
    const { service, repository, posts } = setup();
    repository.getActiveGroup.mockResolvedValue({
      id: 'group-1',
      integrations: [
        {
          integration: { ...connections[0], disabled: true },
        },
      ],
    });
    await expect(
      service.create('org-1', 'fleet-campaign-005', input, now)
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        failureClass: 'user_action_needed',
        code: 'connection_disabled',
        reason: expect.any(String),
      }),
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(posts.createPost).not.toHaveBeenCalled();
  });
});
