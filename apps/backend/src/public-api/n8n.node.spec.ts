import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = resolve(
  __dirname,
  '../../../../integrations/n8n-nodes-publishly'
);
const {
  Publishly,
  PublishlyTrigger,
  verifyWebhook,
} = jest.requireActual(resolve(packageRoot, 'index.js'));

function actionContext(
  parameters: Record<string, unknown>,
  httpRequest = jest.fn()
) {
  return {
    getInputData: () => [{ json: { source: true } }],
    getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
      parameters[name] ?? fallback,
    getCredentials: async () => ({
      baseUrl: 'https://api.publishly.test/',
      apiKey: 'pub_scoped_key',
    }),
    helpers: { httpRequest },
  };
}

describe('official n8n Publishly node', () => {
  it('ships installable credential, action, and trigger entry points', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(packageRoot, 'package.json'), 'utf8')
    );
    expect(manifest.name).toBe('n8n-nodes-publishly');
    expect(manifest.keywords).toContain('n8n-community-node-package');
    for (const file of [
      ...manifest.n8n.credentials,
      ...manifest.n8n.nodes,
    ]) {
      expect(existsSync(resolve(packageRoot, file))).toBe(true);
    }
    expect(new Publishly().description.credentials[0].name).toBe(
      'publishlyApi'
    );
    expect(new PublishlyTrigger().description.webhooks[0].path).toBe('events');
  });

  it('publishes now with the unchanged idempotency key and exposes replays', async () => {
    const httpRequest = jest.fn().mockResolvedValue({
      body: [{ postId: 'post-1', integration: 'linkedin' }],
      headers: { 'idempotency-replayed': 'true' },
    });
    const context = actionContext(
      {
        operation: 'publishNow',
        idempotencyKey: 'campaign:location-42',
        postBody: {
          shortLink: false,
          tags: [],
          posts: [{ integration: { id: 'connection-1' } }],
        },
      },
      httpRequest
    );

    await expect(new Publishly().execute.call(context)).resolves.toEqual([
      [
        {
          json: {
            result: [{ postId: 'post-1', integration: 'linkedin' }],
            idempotencyReplayed: true,
          },
          pairedItem: { item: 0 },
        },
      ],
    ]);
    expect(httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://api.publishly.test/public/v1/posts',
        headers: expect.objectContaining({
          Authorization: 'pub_scoped_key',
          'Idempotency-Key': 'campaign:location-42',
        }),
        body: expect.objectContaining({ type: 'now' }),
        returnFullResponse: true,
      })
    );
  });

  it('schedules at an ISO time and rejects invalid schedule or idempotency input', async () => {
    const httpRequest = jest
      .fn()
      .mockResolvedValue({ body: [{ postId: 'post-1' }], headers: {} });
    const context = actionContext(
      {
        operation: 'schedulePost',
        idempotencyKey: 'schedule-1234',
        scheduledAt: '2026-09-01T12:30:00-04:00',
        postBody: { shortLink: false, tags: [], posts: [{}] },
      },
      httpRequest
    );
    await new Publishly().execute.call(context);
    expect(httpRequest.mock.calls[0][0].body).toMatchObject({
      type: 'schedule',
      date: '2026-09-01T16:30:00.000Z',
    });

    const invalidKeyRequest = jest.fn();
    await expect(
      new Publishly().execute.call(
        actionContext(
          {
            operation: 'publishNow',
            idempotencyKey: 'short',
            postBody: {},
          },
          invalidKeyRequest
        )
      )
    ).rejects.toMatchObject({
      code: 'invalid_idempotency_key',
      failureClass: 'data_problem',
      reason: expect.any(String),
    });
    expect(invalidKeyRequest).not.toHaveBeenCalled();

    await expect(
      new Publishly().execute.call(
        actionContext({
          operation: 'schedulePost',
          idempotencyKey: 'schedule-1234',
          scheduledAt: 'not-a-date',
          postBody: {},
        })
      )
    ).rejects.toMatchObject({
      code: 'invalid_schedule_date',
      reason: expect.any(String),
    });
  });

  it('rejects malformed JSON before sending and propagates Publishly API errors', async () => {
    const neverCalled = jest.fn();
    await expect(
      new Publishly().execute.call(
        actionContext(
          {
            operation: 'publishNow',
            idempotencyKey: 'publish-1234',
            postBody: '{bad json',
          },
          neverCalled
        )
      )
    ).rejects.toMatchObject({
      code: 'invalid_json_body',
      reason: expect.any(String),
    });
    expect(neverCalled).not.toHaveBeenCalled();

    const providerFailure = Object.assign(new Error('429 rate_limited'), {
      response: {
        body: {
          failureClass: 'recoverable',
          code: 'rate_limited',
          reason: 'The provider rate-limited this connection.',
        },
      },
    });
    await expect(
      new Publishly().execute.call(
        actionContext(
          {
            operation: 'publishNow',
            idempotencyKey: 'publish-1234',
            postBody: {},
          },
          jest.fn().mockRejectedValue(providerFailure)
        )
      )
    ).rejects.toBe(providerFailure);
  });

  it('queries encoded receipt IDs and fleet filters without changing them', async () => {
    const receiptRequest = jest.fn().mockResolvedValue({ receipts: [] });
    await new Publishly().execute.call(
      actionContext(
        { operation: 'getReceipts', postId: 'post/id with space' },
        receiptRequest
      )
    );
    expect(receiptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url:
          'https://api.publishly.test/public/v1/posts/post%2Fid%20with%20space/receipts',
      })
    );

    const healthRequest = jest.fn().mockResolvedValue({ rows: [] });
    await new Publishly().execute.call(
      actionContext(
        {
          operation: 'getFleetHealth',
          windowDays: '90',
          groupId: 'group-1',
          tagId: 'tag-1',
          color: 'red',
        },
        healthRequest
      )
    );
    expect(healthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://api.publishly.test/public/v1/fleet-health',
        qs: {
          windowDays: '90',
          groupId: 'group-1',
          tagId: 'tag-1',
          color: 'red',
        },
      })
    );
  });

  it('registers and deletes trigger webhooks, retaining state when deletion fails', async () => {
    const staticData: Record<string, string> = {};
    const httpRequest = jest
      .fn()
      .mockResolvedValueOnce({ id: 'hook-1', signingSecret: 'whsec_secret' })
      .mockRejectedValueOnce(new Error('webhook delete failed'))
      .mockResolvedValueOnce({ deleted: true });
    const context = {
      getWorkflowStaticData: () => staticData,
      getNodeParameter: () => 'connection-1, connection-2',
      getWorkflow: () => ({ id: 'workflow-1' }),
      getNode: () => ({ id: 'node-1' }),
      getNodeWebhookUrl: () => 'https://n8n.test/webhook/events',
      getCredentials: async () => ({
        baseUrl: 'https://api.publishly.test',
        apiKey: 'pub_webhook_key',
      }),
      helpers: { httpRequest },
    };
    const methods = new PublishlyTrigger().webhookMethods.default;
    await expect(methods.create.call(context)).resolves.toBe(true);
    expect(staticData).toEqual({
      publishlyWebhookId: 'hook-1',
      publishlySigningSecret: 'whsec_secret',
    });
    expect(httpRequest.mock.calls[0][0].body).toMatchObject({
      url: 'https://n8n.test/webhook/events',
      integrations: [{ id: 'connection-1' }, { id: 'connection-2' }],
    });

    await expect(methods.delete.call(context)).rejects.toThrow(
      'webhook delete failed'
    );
    expect(staticData.publishlyWebhookId).toBe('hook-1');
    await expect(methods.delete.call(context)).resolves.toBe(true);
    expect(staticData).toEqual({});
  });

  it('verifies signed events and rejects stale, changed, or mismatched envelopes', () => {
    const body = {
      specversion: '1.0',
      id: 'post.receipt:1',
      type: 'post.receipt',
      time: '2026-08-10T13:00:00.000Z',
      data: { stage: 'confirmed_live' },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const now = Date.parse('2026-08-10T13:00:10.000Z');
    const timestamp = String(Math.floor(now / 1000));
    const digest = createHmac('sha256', 'whsec_secret')
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const headers = {
      'x-publishly-timestamp': timestamp,
      'x-publishly-signature': `t=${timestamp},v1=${digest}`,
      'x-publishly-event-id': body.id,
      'x-publishly-event': body.type,
    };

    expect(
      verifyWebhook({ rawBody, body, headers, signingSecret: 'whsec_secret', now })
    ).toBe(body);
    expect(() =>
      verifyWebhook({
        rawBody: Buffer.from(`${rawBody.toString()} `),
        body,
        headers,
        signingSecret: 'whsec_secret',
        now,
      })
    ).toThrow('invalid_webhook_signature');
    expect(() =>
      verifyWebhook({
        rawBody,
        body,
        headers,
        signingSecret: 'whsec_secret',
        now: now + 301_000,
      })
    ).toThrow('stale_webhook_signature');
    expect(() =>
      verifyWebhook({
        rawBody,
        body: { ...body, type: 'post.failure' },
        headers,
        signingSecret: 'whsec_secret',
        now,
      })
    ).toThrow('invalid_webhook_envelope');
  });
});
