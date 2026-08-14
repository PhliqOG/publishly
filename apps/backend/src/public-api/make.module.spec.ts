import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bundleRoot = resolve(
  __dirname,
  '../../../../integrations/make-publishly'
);

function readJson<T = any>(file: string): T {
  return JSON.parse(readFileSync(resolve(bundleRoot, file), 'utf8')) as T;
}

describe('official Publishly Make custom app', () => {
  const manifest = readJson('app.json');

  it('indexes parseable Base, connection, webhook, and module components', () => {
    expect(manifest).toMatchObject({
      name: 'publishly',
      version: '1.0.0',
      base: 'base.json',
    });
    const files = [
      manifest.base,
      ...manifest.connections,
      ...manifest.webhooks,
      ...manifest.modules,
    ];
    expect(files).toHaveLength(8);
    for (const file of files) {
      expect(() => readJson(file)).not.toThrow();
    }
  });

  it('validates credentials and sanitizes all secrets', () => {
    const connection = readJson('connections/publishly.json');
    expect(connection.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'baseUrl', type: 'url', required: true }),
        expect.objectContaining({
          name: 'apiKey',
          type: 'password',
          required: true,
        }),
      ])
    );
    expect(connection.communication).toMatchObject({
      method: 'GET',
      url: '{{parameters.baseUrl}}/public/v1/is-connected',
      headers: { Authorization: '{{parameters.apiKey}}' },
    });
    expect(connection.communication.response.valid).toContain('body.connected');
    expect(connection.communication.log.sanitize).toContain(
      'request.headers.Authorization'
    );

    const base = readJson('base.json');
    expect(base.log.sanitize).toEqual(
      expect.arrayContaining([
        'request.headers.Authorization',
        'response.body.signingSecret',
      ])
    );
  });

  it('maps every material HTTP failure to a visible Make error', () => {
    const error = readJson('base.json').response.error;
    expect(error.message).toContain('body.reason');
    expect(error.message).toContain('body.message');
    expect(error.message).toContain('body.msg');
    expect(error['400']).toMatchObject({ type: 'DataError' });
    expect(error['401']).toMatchObject({ type: 'InvalidAccessTokenError' });
    expect(error['403']).toMatchObject({ type: 'InvalidAccessTokenError' });
    expect(error['409']).toMatchObject({ type: 'RuntimeError' });
    expect(error['409'].message).toContain('body.code');
    expect(error['429']).toMatchObject({ type: 'RateLimitError' });
    for (const status of ['500', '503', '504']) {
      expect(error[status]).toMatchObject({
        type: 'ConnectionError',
        message: expect.stringContaining('body'),
      });
    }
    expect(JSON.stringify(error)).not.toContain('DuplicateDataError');
  });

  it.each([
    ['modules/publish-now.json', 'now'],
    ['modules/schedule-post.json', 'schedule'],
  ])('%s requires and forwards idempotency for %s creation', (file, type) => {
    const actionModule = readJson(file);
    expect(actionModule.type).toBe('action');
    expect(actionModule.communication).toMatchObject({
      method: 'POST',
      url: '/posts',
      headers: {
        'Idempotency-Key': '{{parameters.idempotencyKey}}',
      },
      body: { type },
    });
    expect(actionModule.mappableParameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'idempotencyKey',
          type: 'text',
          required: true,
        }),
        expect.objectContaining({ name: 'posts', type: 'json', required: true }),
      ])
    );
    expect(
      actionModule.communication.response.output.idempotencyReplayed
    ).toContain('Idempotency-Replayed');
    expect(actionModule.communication.retry).toBeUndefined();
  });

  it('uses stable receipt and fleet-health routes', () => {
    const receipts = readJson('modules/get-delivery-receipts.json');
    expect(receipts.communication).toMatchObject({
      method: 'GET',
      url: '/posts/{{encodeURL(parameters.postId)}}/receipts',
    });
    expect(receipts.mappableParameters[0]).toMatchObject({
      name: 'postId',
      required: true,
    });

    const health = readJson('modules/get-fleet-health.json');
    expect(health.communication).toMatchObject({
      method: 'GET',
      url: '/fleet-health',
      qs: {
        windowDays: '{{parameters.windowDays}}',
        groupId: '{{parameters.groupId}}',
        tagId: '{{parameters.tagId}}',
        color: '{{parameters.color}}',
      },
    });
  });

  it('attaches, authenticates, and detaches the dedicated instant webhook', () => {
    const webhook = readJson('webhooks/publishly-events.json');
    expect(webhook).toMatchObject({
      type: 'dedicated-attached',
      attach: {
        method: 'POST',
        url: '/webhooks',
        body: { url: '{{webhook.url}}', integrations: [] },
        response: {
          data: {
            externalHookId: '{{body.id}}',
            signingSecret: '{{body.signingSecret}}',
          },
        },
      },
      detach: {
        method: 'DELETE',
        url: '/webhooks/{{encodeURL(webhook.externalHookId)}}',
      },
    });
    expect(webhook.communication.verification).toMatchObject({
      respond: {
        status: 401,
        body: {
          code: 'invalid_webhook_signature',
          reason: expect.any(String),
        },
      },
    });
    for (const required of [
      'sha256(',
      'parameters.signingSecret',
      "formatDate(now, 'X')",
      '> 300',
      'X-Publishly-Event-Id',
      'X-Publishly-Event',
    ]) {
      expect(webhook.communication.verification.condition).toContain(required);
    }
    expect(webhook.communication.respond.status).toBe(202);

    const trigger = readJson('modules/watch-events.json');
    expect(trigger).toMatchObject({
      type: 'instant-trigger',
      webhook: 'publishlyEvents',
    });
    expect(trigger.interface.map((field: any) => field.name)).toEqual([
      'specversion',
      'id',
      'type',
      'time',
      'data',
    ]);
  });
});
