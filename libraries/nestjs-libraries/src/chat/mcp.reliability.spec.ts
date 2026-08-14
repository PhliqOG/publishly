import { BadRequestException, HttpException } from '@nestjs/common';

jest.mock('@mastra/core/tools', () => ({
  createTool: (definition: any) => definition,
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/reliable-post-creation.service',
  () => ({ ReliablePostCreationService: class ReliablePostCreationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/fleet-health/fleet-health.service',
  () => ({ FleetHealthService: class FleetHealthService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service',
  () => ({ ApiKeysService: class ApiKeysService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service',
  () => ({ OAuthService: class OAuthService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class OrganizationService {} })
);

import { runWithContext } from './async.storage';
import { requireMcpOrganization } from './mcp.auth.policy';
import { resolveMcpCredential } from './mcp.auth.resolver';
import { asMcpToolError, McpToolError } from './mcp.tool.error';
import { FleetHealthTool } from './tools/fleet.health.tool';
import { PostReceiptsTool } from './tools/post.receipts.tool';
import { PublishPostTool } from './tools/publish.post.tool';
import { SchedulePostTool } from './tools/schedule.post.tool';

const organization = {
  id: 'org-1',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const postInput = {
  idempotencyKey: 'campaign:location-1',
  shortLink: false,
  tags: [],
  posts: [
    {
      integration: { id: 'connection-1' },
      settings: {},
      value: [{ content: 'Hello fleet', image: [] }],
    },
  ],
};

function execute(tool: any, input: any, scopes: string[]) {
  return runWithContext(
    {
      requestId: 'request-1',
      auth: organization,
      scopes,
      authKind: 'api_key',
    },
    () => tool.execute(input, { mcp: {} })
  );
}

describe('MCP credential resolution', () => {
  const originalLegacySetting = process.env.ALLOW_LEGACY_API_KEYS;

  afterEach(() => {
    if (originalLegacySetting === undefined) {
      delete process.env.ALLOW_LEGACY_API_KEYS;
    } else {
      process.env.ALLOW_LEGACY_API_KEYS = originalLegacySetting;
    }
  });

  function dependencies() {
    return {
      oauthService: {
        getOrgByOAuthToken: jest.fn(),
      },
      apiKeysService: {
        validateKey: jest.fn(),
      },
      organizationService: {
        getOrgByApiKey: jest.fn(),
      },
    } as any;
  }

  it('resolves OAuth and scoped public API keys without consulting legacy storage', async () => {
    const oauth = dependencies();
    oauth.oauthService.getOrgByOAuthToken.mockResolvedValue({ organization });
    await expect(resolveMcpCredential('pos_valid', oauth)).resolves.toEqual({
      organization,
      scopes: ['mcp:read', 'mcp:write'],
      kind: 'oauth',
    });
    expect(oauth.organizationService.getOrgByApiKey).not.toHaveBeenCalled();

    const apiKey = dependencies();
    apiKey.apiKeysService.validateKey.mockResolvedValue({
      organization,
      scopes: ['posts:write', 'posts:read'],
    });
    await expect(resolveMcpCredential('pub_valid', apiKey)).resolves.toEqual({
      organization,
      scopes: ['posts:write', 'posts:read'],
      kind: 'api_key',
    });
    expect(apiKey.organizationService.getOrgByApiKey).not.toHaveBeenCalled();
  });

  it('rejects invalid and legacy credentials by default', async () => {
    delete process.env.ALLOW_LEGACY_API_KEYS;
    const invalid = dependencies();
    invalid.apiKeysService.validateKey.mockResolvedValue(null);
    await expect(resolveMcpCredential('pub_invalid', invalid)).resolves.toBeNull();
    await expect(resolveMcpCredential('legacy-secret', invalid)).resolves.toBeNull();
    expect(invalid.organizationService.getOrgByApiKey).not.toHaveBeenCalled();
  });

  it('supports legacy keys only behind the explicit migration flag', async () => {
    process.env.ALLOW_LEGACY_API_KEYS = 'true';
    const legacy = dependencies();
    legacy.organizationService.getOrgByApiKey.mockResolvedValue(organization);
    await expect(resolveMcpCredential('legacy-secret', legacy)).resolves.toEqual({
      organization,
      scopes: ['*'],
      kind: 'legacy',
    });
  });
});

describe('MCP scope policy', () => {
  it('returns explicit authentication and authorization failures', async () => {
    expect(() =>
      requireMcpOrganization({}, { mcp: {} }, 'posts:read')
    ).toThrow(
      expect.objectContaining({
        code: 'mcp_authentication_required',
        reason: expect.any(String),
      })
    );

    const denied = runWithContext(
      {
        requestId: 'request-1',
        auth: organization,
        scopes: ['posts:read'],
        authKind: 'api_key',
      },
      () => {
        try {
          requireMcpOrganization({}, { mcp: {} }, 'posts:write');
        } catch (error) {
          return error;
        }
      }
    );
    expect(denied).toMatchObject({
      code: 'mcp_scope_required',
      failureClass: 'user_action_needed',
      reason: expect.stringContaining('posts:write'),
    });
  });

  it.each([
    ['posts:read', ['posts:read']],
    ['posts:write', ['posts:write']],
    ['integrations:read', ['integrations:read']],
    ['posts:read', ['mcp:read']],
    ['integrations:read', ['mcp:read']],
    ['posts:write', ['mcp:write']],
    ['posts:write', ['*']],
  ] as const)('allows %s through an equivalent scope', (required, scopes) => {
    const result = runWithContext(
      {
        requestId: 'request-1',
        auth: organization,
        scopes: [...scopes],
        authKind: 'api_key',
      },
      () => requireMcpOrganization({}, { mcp: {} }, required)
    );
    expect(result).toBe(organization);
  });
});

describe('Publishly MCP reliability tools', () => {
  it('publishes through the shared creation service and reports idempotent replay state', async () => {
    const creation = {
      create: jest.fn().mockResolvedValue({
        value: [{ postId: 'post-1', integration: 'connection-1' }],
        replayed: true,
      }),
    };
    const tool = new PublishPostTool(creation as any).run() as any;

    await expect(execute(tool, postInput, ['posts:write'])).resolves.toEqual({
      output: [{ postId: 'post-1', integration: 'connection-1' }],
      idempotencyReplayed: true,
    });
    expect(tool.id).toBe('publish_post');
    expect(creation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        type: 'now',
        idempotencyKey: 'campaign:location-1',
        creationMethod: 'MCP',
      })
    );
  });

  it('rejects unsafe idempotency keys and write calls with read-only scopes', async () => {
    const creation = { create: jest.fn() };
    const tool = new PublishPostTool(creation as any).run() as any;

    await expect(
      execute(tool, { ...postInput, idempotencyKey: 'bad key' }, ['posts:write'])
    ).rejects.toMatchObject({
      code: 'invalid_idempotency_key',
      reason: expect.any(String),
    });
    await expect(execute(tool, postInput, ['posts:read'])).rejects.toMatchObject({
      code: 'mcp_scope_required',
      failureClass: 'user_action_needed',
    });
    expect(creation.create).not.toHaveBeenCalled();
  });

  it('preserves a classified compose failure from the shared creation service', async () => {
    const creation = {
      create: jest.fn().mockRejectedValue(
        new BadRequestException({
          failureClass: 'data_problem',
          code: 'invalid_media',
          reason: 'The video codec is unsupported.',
        })
      ),
    };
    const tool = new PublishPostTool(creation as any).run() as any;

    await expect(execute(tool, postInput, ['posts:write'])).rejects.toMatchObject({
      code: 'invalid_media',
      reason: 'The video codec is unsupported.',
      failureClass: 'data_problem',
    });
  });

  it('validates schedule timestamps before any creation attempt', async () => {
    const creation = { create: jest.fn() };
    const tool = new SchedulePostTool(creation as any).run() as any;

    await expect(
      execute(
        tool,
        { ...postInput, scheduledAt: 'not-a-date' },
        ['posts:write']
      )
    ).rejects.toMatchObject({
      code: 'invalid_schedule_date',
      reason: expect.any(String),
    });
    expect(creation.create).not.toHaveBeenCalled();
  });

  it('schedules with the exact normalized timestamp and idempotency key', async () => {
    const creation = {
      create: jest.fn().mockResolvedValue({ value: [], replayed: false }),
    };
    const tool = new SchedulePostTool(creation as any).run() as any;

    await execute(
      tool,
      { ...postInput, scheduledAt: '2026-08-12T13:45:00-04:00' },
      ['posts:write']
    );
    expect(tool.id).toBe('schedule_post');
    expect(creation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'campaign:location-1',
        type: 'schedule',
        rawBody: expect.objectContaining({
          date: '2026-08-12T17:45:00.000Z',
        }),
      })
    );
  });

  it('returns receipt evidence and an explicit missing-job failure', async () => {
    const posts = {
      getPublishingJob: jest.fn().mockResolvedValue({
        state: 'RETRY_SCHEDULED',
        deliveryStage: 'uploading',
        attempts: 2,
        nextAttemptAt: new Date('2026-08-10T12:05:00.000Z'),
        failureClass: 'recoverable',
        failureCode: 'rate_limited',
        failureReason: 'The provider asked Publishly to retry later.',
      }),
      listDeliveryReceipts: jest
        .fn()
        .mockResolvedValue([{ stage: 'uploading' }]),
    };
    const tool = new PostReceiptsTool(posts as any).run() as any;

    await expect(
      execute(tool, { postId: 'post-1' }, ['posts:read'])
    ).resolves.toMatchObject({
      postId: 'post-1',
      state: 'RETRY_SCHEDULED',
      attempts: 2,
      failure: {
        class: 'recoverable',
        code: 'rate_limited',
        reason: expect.any(String),
      },
      receipts: [{ stage: 'uploading' }],
    });

    posts.getPublishingJob.mockResolvedValue(null);
    await expect(
      execute(tool, { postId: 'missing' }, ['posts:read'])
    ).rejects.toMatchObject({
      code: 'publishing_job_not_found',
      reason: expect.any(String),
    });
  });

  it('classifies downstream receipt and fleet-health outages with non-empty reasons', async () => {
    const posts = {
      getPublishingJob: jest
        .fn()
        .mockRejectedValue(new Error('Database service unavailable')),
      listDeliveryReceipts: jest.fn(),
    };
    const receiptsTool = new PostReceiptsTool(posts as any).run() as any;
    await expect(
      execute(receiptsTool, { postId: 'post-1' }, ['posts:read'])
    ).rejects.toMatchObject({
      failureClass: 'recoverable',
      code: 'provider_unavailable',
      reason: 'Database service unavailable',
    });

    const fleet = {
      getFleetHealth: jest
        .fn()
        .mockRejectedValue(new Error('Fleet health service unavailable')),
    };
    const fleetTool = new FleetHealthTool(fleet as any).run() as any;
    await expect(
      execute(fleetTool, { windowDays: '30' }, ['integrations:read'])
    ).rejects.toMatchObject({
      failureClass: 'recoverable',
      code: 'provider_unavailable',
      reason: 'Fleet health service unavailable',
    });
    expect(fleetTool.id).toBe('get_fleet_health');
  });

  it('serializes every tool error as a stable machine-readable object', () => {
    const error = new McpToolError(
      'mcp_scope_required',
      'Grant posts:write before retrying.',
      'user_action_needed'
    );
    expect(error.toJSON()).toEqual({
      failureClass: 'user_action_needed',
      code: 'mcp_scope_required',
      reason: 'Grant posts:write before retrying.',
    });
    expect(error.message).not.toMatch(/undefined|unknown/i);
  });

  it('classifies string HTTP exceptions instead of treating bad input as retryable', () => {
    expect(
      asMcpToolError(new HttpException('Integration id is required.', 400))
    ).toMatchObject({
      failureClass: 'data_problem',
      code: 'http_400',
      reason: 'Integration id is required.',
    });
  });
});
