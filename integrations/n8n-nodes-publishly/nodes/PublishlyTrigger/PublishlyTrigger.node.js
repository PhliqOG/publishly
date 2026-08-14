'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const {
  PublishlyNodeError,
  headerValue,
  publishlyApiRequest,
} = require('../Publishly/transport');

const ALL_EVENTS = [
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

function parseIntegrationIds(value) {
  const ids = String(value || '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    throw new PublishlyNodeError(
      'duplicate_webhook_connection',
      'Each connection ID may be selected only once.'
    );
  }
  if (ids.length > 500) {
    throw new PublishlyNodeError(
      'too_many_webhook_connections',
      'A webhook may filter at most 500 connections.'
    );
  }
  return ids;
}

function verifyWebhook({ rawBody, body, headers, signingSecret, now = Date.now() }) {
  if (!signingSecret) {
    throw new PublishlyNodeError(
      'missing_webhook_secret',
      'The Publishly webhook signing secret is missing. Reactivate the workflow.',
      'user_action_needed'
    );
  }
  const timestamp = String(headerValue(headers, 'X-Publishly-Timestamp') || '');
  const signature = String(headerValue(headers, 'X-Publishly-Signature') || '');
  const eventId = String(headerValue(headers, 'X-Publishly-Event-Id') || '');
  const eventType = String(headerValue(headers, 'X-Publishly-Event') || '');
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature);
  if (!match || match[1] !== timestamp) {
    throw new PublishlyNodeError(
      'invalid_webhook_signature',
      'Publishly webhook signature headers are missing or malformed.',
      'user_action_needed'
    );
  }
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) {
    throw new PublishlyNodeError(
      'stale_webhook_signature',
      'Publishly webhook timestamp is outside the five-minute tolerance.',
      'user_action_needed'
    );
  }
  const bytes = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(
        typeof rawBody === 'string' ? rawBody : JSON.stringify(body),
        'utf8'
      );
  const expected = createHmac('sha256', signingSecret)
    .update(`${timestamp}.`)
    .update(bytes)
    .digest();
  const received = Buffer.from(match[2], 'hex');
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new PublishlyNodeError(
      'invalid_webhook_signature',
      'Publishly webhook signature does not match the request body.',
      'user_action_needed'
    );
  }
  if (!body || body.id !== eventId || body.type !== eventType) {
    throw new PublishlyNodeError(
      'invalid_webhook_envelope',
      'Webhook envelope ID and type must match the signed Publishly headers.'
    );
  }
  return body;
}

class PublishlyTrigger {
  constructor() {
    this.description = {
      displayName: 'Publishly Trigger',
      name: 'publishlyTrigger',
      icon: 'file:publishly.svg',
      group: ['trigger'],
      version: 1,
      description: 'Starts a workflow for signed Publishly delivery and health events.',
      defaults: { name: 'Publishly Trigger' },
      inputs: [],
      outputs: ['main'],
      credentials: [{ name: 'publishlyApi', required: true }],
      webhooks: [
        {
          name: 'default',
          httpMethod: 'POST',
          responseMode: 'onReceived',
          path: 'events',
        },
      ],
      properties: [
        {
          displayName: 'Events',
          name: 'events',
          type: 'multiOptions',
          options: ALL_EVENTS.map((event) => ({ name: event, value: event })),
          default: ALL_EVENTS,
          required: true,
          description: 'Only selected signed events start the workflow.',
        },
        {
          displayName: 'Connection IDs',
          name: 'integrationIds',
          type: 'string',
          default: '',
          description:
            'Optional comma- or whitespace-separated Publishly connection IDs. Empty subscribes to the whole fleet.',
        },
      ],
    };

    this.webhookMethods = {
      default: {
        checkExists: async function checkExists() {
          const data = this.getWorkflowStaticData('node');
          return Boolean(data.publishlyWebhookId && data.publishlySigningSecret);
        },
        create: async function create() {
          const data = this.getWorkflowStaticData('node');
          const ids = parseIntegrationIds(
            this.getNodeParameter('integrationIds', 0, '')
          );
          const workflow = this.getWorkflow();
          const node = this.getNode();
          const result = await publishlyApiRequest(this, {
            method: 'POST',
            path: '/webhooks',
            body: {
              name: `n8n ${workflow.id || 'workflow'} ${node.id}`.slice(0, 100),
              url: this.getNodeWebhookUrl('default'),
              integrations: ids.map((id) => ({ id })),
            },
          });
          if (!result?.id || !result?.signingSecret) {
            throw new PublishlyNodeError(
              'invalid_webhook_registration_response',
              'Publishly did not return a webhook ID and one-time signing secret.',
              'recoverable'
            );
          }
          data.publishlyWebhookId = result.id;
          data.publishlySigningSecret = result.signingSecret;
          return true;
        },
        delete: async function remove() {
          const data = this.getWorkflowStaticData('node');
          if (!data.publishlyWebhookId) return true;
          await publishlyApiRequest(this, {
            method: 'DELETE',
            path: `/webhooks/${encodeURIComponent(data.publishlyWebhookId)}`,
          });
          delete data.publishlyWebhookId;
          delete data.publishlySigningSecret;
          return true;
        },
      },
    };
  }

  async webhook() {
    const request = this.getRequestObject();
    const body = this.getBodyData();
    const data = this.getWorkflowStaticData('node');
    const verified = verifyWebhook({
      rawBody: request.rawBody,
      body,
      headers: request.headers,
      signingSecret: data.publishlySigningSecret,
    });
    const selected = this.getNodeParameter('events', 0, ALL_EVENTS);
    if (!Array.isArray(selected) || !selected.includes(verified.type)) {
      return { workflowData: [[]] };
    }
    return { workflowData: [this.helpers.returnJsonArray([verified])] };
  }
}

module.exports = {
  ALL_EVENTS,
  PublishlyTrigger,
  parseIntegrationIds,
  verifyWebhook,
};
