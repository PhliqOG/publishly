import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException } from '@nestjs/common';
import { requiredScopeFor } from '../services/auth/public.auth.middleware';
import { API_KEY_SCOPES } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { assertWebhookConnections } from './public.distribution.policy';

const repositoryRoot = resolve(__dirname, '../../../..');

describe('distribution and webhook contract', () => {
  it('documents every emitted event type and signature header', () => {
    const guide = readFileSync(
      resolve(repositoryRoot, 'docs/WEBHOOKS.md'),
      'utf8'
    );
    const sources = [
      'libraries/nestjs-libraries/src/database/prisma/publishing-jobs/publishing-receipt.service.ts',
      'libraries/nestjs-libraries/src/database/prisma/publishing-jobs/publishing-failure.service.ts',
      'libraries/nestjs-libraries/src/database/prisma/connection-health/connection-health.service.ts',
    ].map((file) => readFileSync(resolve(repositoryRoot, file), 'utf8'));
    const emittedTypes = [
      'post.receipt',
      'post.failure',
      'token.expiring',
      'token.expired',
      'token.refreshed',
      'connection.at_risk',
      'connection.reconnect_required',
      'connection.stale',
      'connection.dead',
      'connection.recovered',
      'platform.ready',
      'platform.limitation',
      'platform.invalid',
      'platform.truth_unknown',
    ];

    for (const eventType of emittedTypes) {
      expect(sources.some((source) => source.includes(eventType))).toBe(true);
      expect(guide).toContain(`\`${eventType}\``);
    }
    for (const header of [
      'X-Publishly-Event',
      'X-Publishly-Event-Id',
      'X-Publishly-Timestamp',
      'X-Publishly-Signature',
    ]) {
      expect(sources.every((source) => source.includes(header))).toBe(true);
      expect(guide).toContain(`\`${header}\``);
    }
    expect(guide).toContain('at least once');
    expect(guide).toContain('three times');
    expect(guide).toContain('exact raw request body');
    expect(guide).toMatch(/webhookState` as\s+`FAILED`/);
  });

  it('assigns narrow scopes to fleet-health and webhook routes', () => {
    expect(requiredScopeFor('GET', '/public/v1/fleet-health')).toBe(
      'integrations:read'
    );
    expect(requiredScopeFor('GET', '/public/v1/webhooks')).toBe(
      'webhooks:read'
    );
    expect(requiredScopeFor('POST', '/public/v1/webhooks')).toBe(
      'webhooks:write'
    );
    expect(requiredScopeFor('DELETE', '/public/v1/webhooks/hook-1')).toBe(
      'webhooks:write'
    );
    expect(API_KEY_SCOPES).toEqual(
      expect.arrayContaining(['webhooks:read', 'webhooks:write'])
    );
    const controllerSource = readFileSync(
      resolve(
        repositoryRoot,
        'apps/backend/src/public-api/routes/v1/public.integrations.controller.ts'
      ),
      'utf8'
    );
    for (const route of [
      "@Get('/fleet-health')",
      "@Get('/webhooks')",
      "@Post('/webhooks')",
      "@Delete('/webhooks/:id')",
      "@Post('/webhooks/:id/rotate-secret')",
    ]) {
      expect(controllerSource).toContain(route);
    }
  });

  it('accepts only tenant-owned, unique webhook connection filters', async () => {
    const findIntegration = jest
      .fn()
      .mockResolvedValueOnce({ id: 'connection-1' })
      .mockResolvedValueOnce({ id: 'connection-2' });
    await expect(
      assertWebhookConnections(
        'org-1',
        [{ id: 'connection-1' }, { id: 'connection-2' }],
        findIntegration
      )
    ).resolves.toBeUndefined();
    expect(findIntegration).toHaveBeenNthCalledWith(1, 'org-1', 'connection-1');
    expect(findIntegration).toHaveBeenNthCalledWith(2, 'org-1', 'connection-2');

    await expect(
      assertWebhookConnections(
        'org-1',
        [{ id: 'same' }, { id: 'same' }],
        jest.fn()
      )
    ).rejects.toMatchObject({
      response: {
        code: 'duplicate_webhook_connection',
        reason: expect.any(String),
      },
    });

    const missing = jest.fn().mockResolvedValue(null);
    await expect(
      assertWebhookConnections(
        'org-1',
        [{ id: 'other-org-connection' }],
        missing
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(missing).toHaveBeenCalledWith('org-1', 'other-org-connection');
  });

  it('ships all three official adapter sources against one documented contract', () => {
    const guide = readFileSync(
      resolve(repositoryRoot, 'docs/DISTRIBUTION.md'),
      'utf8'
    );
    const readme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8');
    const facts = JSON.parse(
      readFileSync(
        resolve(repositoryRoot, 'data/public-product-facts.json'),
        'utf8'
      )
    );
    const n8nPackage = JSON.parse(
      readFileSync(
        resolve(
          repositoryRoot,
          'integrations/n8n-nodes-publishly/package.json'
        ),
        'utf8'
      )
    );
    const makeApp = JSON.parse(
      readFileSync(
        resolve(repositoryRoot, 'integrations/make-publishly/app.json'),
        'utf8'
      )
    );

    expect(readme).toContain('docs/DISTRIBUTION.md');
    expect(n8nPackage.name).toBe('n8n-nodes-publishly');
    expect(n8nPackage.n8n.nodes).toHaveLength(2);
    expect(makeApp.modules).toEqual(
      expect.arrayContaining([
        'modules/publish-now.json',
        'modules/schedule-post.json',
        'modules/get-delivery-receipts.json',
        'modules/get-fleet-health.json',
        'modules/watch-events.json',
      ])
    );
    expect(facts.api.n8n.source).toBe('integrations/n8n-nodes-publishly');
    expect(facts.api.make.source).toBe('integrations/make-publishly');
    expect(facts.api.mcp.auth).toMatch(/scoped pub_/i);
    expect(facts.reliability.success_webhook.claim).toContain('post.receipt');
    expect(JSON.stringify(facts)).not.toMatch(
      /no first-party (?:node|module) yet/i
    );

    for (const value of [
      'publish_post',
      'schedule_post',
      'get_post_receipts',
      'get_fleet_health',
      'Idempotency-Key',
      'confirmed_live',
      'ALLOW_LEGACY_API_KEYS=true',
    ]) {
      expect(guide).toContain(value);
    }
    expect(guide).toMatch(/does not claim.+(?:catalog|listed)/i);
  });

  it('keeps MCP writes on the canonical creation service and legacy URL auth gated', () => {
    const toolList = readFileSync(
      resolve(
        repositoryRoot,
        'libraries/nestjs-libraries/src/chat/tools/tool.list.ts'
      ),
      'utf8'
    );
    const transport = readFileSync(
      resolve(
        repositoryRoot,
        'libraries/nestjs-libraries/src/chat/start.mcp.ts'
      ),
      'utf8'
    );
    const publicController = readFileSync(
      resolve(
        repositoryRoot,
        'apps/backend/src/public-api/routes/v1/public.integrations.controller.ts'
      ),
      'utf8'
    );
    const publishTool = readFileSync(
      resolve(
        repositoryRoot,
        'libraries/nestjs-libraries/src/chat/tools/publish.post.tool.ts'
      ),
      'utf8'
    );
    const scheduleTool = readFileSync(
      resolve(
        repositoryRoot,
        'libraries/nestjs-libraries/src/chat/tools/schedule.post.tool.ts'
      ),
      'utf8'
    );

    for (const name of [
      'PublishPostTool',
      'SchedulePostTool',
      'PostReceiptsTool',
      'FleetHealthTool',
    ]) {
      expect(toolList).toContain(name);
    }
    expect(toolList).not.toContain('IntegrationSchedulePostTool');
    expect(transport).toContain("app.use('/mcp'");
    expect(transport).toContain('resolveMcpCredential');
    expect(transport).toContain("process.env.ALLOW_LEGACY_API_KEYS !== 'true'");
    expect(publicController).toContain('_reliablePostCreation.create');
    expect(publishTool).toContain('ReliablePostCreationService');
    expect(scheduleTool).toContain('ReliablePostCreationService');
  });

  it('never hides public-API disconnect cleanup failures or deletes posts before revocation', () => {
    const controller = readFileSync(
      resolve(
        repositoryRoot,
        'apps/backend/src/public-api/routes/v1/public.integrations.controller.ts'
      ),
      'utf8'
    );
    const deleteHandler = controller.slice(
      controller.indexOf("@Delete('/integrations/:id')"),
      controller.indexOf("@Get('/integration-settings/:id')")
    );
    expect(deleteHandler).not.toContain('.catch(() => {})');
    expect(deleteHandler).toContain('Promise.allSettled');
    expect(deleteHandler).toContain("code: 'scheduled_post_cleanup_failed'");
    expect(deleteHandler.indexOf('deleteChannel(org.id, id)')).toBeLessThan(
      deleteHandler.indexOf('deletePost(org.id, post.group)')
    );
  });

  it('keeps the signed-in developer surface on Publishly-owned distribution paths', () => {
    const publicApiUi = readFileSync(
      resolve(
        repositoryRoot,
        'apps/frontend/src/components/public-api/public.component.tsx'
      ),
      'utf8'
    );
    const developerUi = readFileSync(
      resolve(
        repositoryRoot,
        'apps/frontend/src/components/developer/developer.component.tsx'
      ),
      'utf8'
    );
    const addProviderUi = readFileSync(
      resolve(
        repositoryRoot,
        'apps/frontend/src/components/launches/add.provider.component.tsx'
      ),
      'utf8'
    );
    expect(publicApiUi).not.toMatch(
      /docs\.postiz\.com|n8n-nodes-postiz|npm install -g postiz/i
    );
    expect(publicApiUi).toContain('mcp_servers.publishly');
    expect(publicApiUi).toContain('href="/integrations/n8n"');
    expect(publicApiUi).toContain('href="/api-docs"');
    expect(developerUi).not.toContain('https://docs.postiz.com');
    expect(developerUi).toContain("'/api-docs'");
    expect(addProviderUi).not.toMatch(
      /chromewebstore\.google\.com\/detail\/postiz/i
    );
    expect(addProviderUi).toContain('extension_not_configured');
  });
});
