'use strict';

const {
  PublishlyNodeError,
  headerValue,
  parseJsonObject,
  publishlyApiRequest,
  requireIdempotencyKey,
} = require('./transport');

class Publishly {
  constructor() {
    this.description = {
      displayName: 'Publishly',
      name: 'publishly',
      icon: 'file:publishly.svg',
      group: ['transform'],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description:
        'Publish idempotently and inspect durable delivery and fleet health.',
      defaults: { name: 'Publishly' },
      inputs: ['main'],
      outputs: ['main'],
      usableAsTool: true,
      credentials: [{ name: 'publishlyApi', required: true }],
      properties: [
        {
          displayName: 'Operation',
          name: 'operation',
          type: 'options',
          noDataExpression: true,
          options: [
            {
              name: 'Publish Now',
              value: 'publishNow',
              description: 'Create an idempotent publish-now request',
              action: 'Publish a post now',
            },
            {
              name: 'Schedule Post',
              value: 'schedulePost',
              description: 'Create an idempotent scheduled post',
              action: 'Schedule a post',
            },
            {
              name: 'Get Delivery Receipts',
              value: 'getReceipts',
              description: 'Get durable delivery lifecycle evidence',
              action: 'Get delivery receipts',
            },
            {
              name: 'Get Fleet Health',
              value: 'getFleetHealth',
              description: 'Get fleet health, queues, and posting success',
              action: 'Get fleet health',
            },
          ],
          default: 'publishNow',
        },
        {
          displayName: 'Idempotency Key',
          name: 'idempotencyKey',
          type: 'string',
          required: true,
          default: '',
          description:
            'Stable key for this creation intent. Reuse the same key and body when n8n retries.',
          displayOptions: {
            show: { operation: ['publishNow', 'schedulePost'] },
          },
        },
        {
          displayName: 'Scheduled At',
          name: 'scheduledAt',
          type: 'dateTime',
          required: true,
          default: '',
          description: 'UTC date and time when Publishly should begin delivery.',
          displayOptions: { show: { operation: ['schedulePost'] } },
        },
        {
          displayName: 'Post Body',
          name: 'postBody',
          type: 'json',
          required: true,
          default: '{\n  "shortLink": false,\n  "tags": [],\n  "posts": []\n}',
          description:
            'Publishly post object. The node sets type and date for the selected operation.',
          displayOptions: {
            show: { operation: ['publishNow', 'schedulePost'] },
          },
        },
        {
          displayName: 'Post ID',
          name: 'postId',
          type: 'string',
          required: true,
          default: '',
          displayOptions: { show: { operation: ['getReceipts'] } },
        },
        {
          displayName: 'Window',
          name: 'windowDays',
          type: 'options',
          options: [
            { name: '7 Days', value: '7' },
            { name: '30 Days', value: '30' },
            { name: '90 Days', value: '90' },
          ],
          default: '30',
          displayOptions: { show: { operation: ['getFleetHealth'] } },
        },
        {
          displayName: 'Group ID',
          name: 'groupId',
          type: 'string',
          default: '',
          displayOptions: { show: { operation: ['getFleetHealth'] } },
        },
        {
          displayName: 'Tag ID',
          name: 'tagId',
          type: 'string',
          default: '',
          displayOptions: { show: { operation: ['getFleetHealth'] } },
        },
        {
          displayName: 'Health Color',
          name: 'color',
          type: 'options',
          options: [
            { name: 'All', value: '' },
            { name: 'Green', value: 'green' },
            { name: 'Yellow', value: 'yellow' },
            { name: 'Red', value: 'red' },
          ],
          default: '',
          displayOptions: { show: { operation: ['getFleetHealth'] } },
        },
      ],
    };
  }

  async execute() {
    const items = this.getInputData();
    const output = [];
    for (let index = 0; index < items.length; index += 1) {
      const operation = this.getNodeParameter('operation', index);
      let value;

      if (operation === 'publishNow' || operation === 'schedulePost') {
        const idempotencyKey = requireIdempotencyKey(
          this.getNodeParameter('idempotencyKey', index)
        );
        const body = parseJsonObject(
          this.getNodeParameter('postBody', index),
          'Post body'
        );
        body.type = operation === 'publishNow' ? 'now' : 'schedule';
        if (operation === 'schedulePost') {
          const scheduledAt = this.getNodeParameter('scheduledAt', index);
          const date = new Date(scheduledAt);
          if (!scheduledAt || Number.isNaN(date.getTime())) {
            throw new PublishlyNodeError(
              'invalid_schedule_date',
              'Scheduled At must be a valid date and time.'
            );
          }
          body.date = date.toISOString();
        } else if (!body.date) {
          body.date = new Date().toISOString();
        }
        const response = await publishlyApiRequest(this, {
          method: 'POST',
          path: '/posts',
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
          fullResponse: true,
        });
        if (!response || response.body === undefined) {
          throw new PublishlyNodeError(
            'invalid_publishly_response',
            'Publishly returned no post-creation response.',
            'recoverable'
          );
        }
        value = {
          result: response.body,
          idempotencyReplayed:
            String(headerValue(response.headers, 'Idempotency-Replayed')) ===
            'true',
        };
      } else if (operation === 'getReceipts') {
        const postId = String(this.getNodeParameter('postId', index) || '').trim();
        if (!postId) {
          throw new PublishlyNodeError(
            'missing_post_id',
            'Post ID is required to retrieve delivery receipts.'
          );
        }
        value = await publishlyApiRequest(this, {
          method: 'GET',
          path: `/posts/${encodeURIComponent(postId)}/receipts`,
        });
      } else if (operation === 'getFleetHealth') {
        const qs = {
          windowDays: this.getNodeParameter('windowDays', index, '30'),
        };
        for (const name of ['groupId', 'tagId', 'color']) {
          const parameter = String(
            this.getNodeParameter(name, index, '') || ''
          ).trim();
          if (parameter) qs[name] = parameter;
        }
        value = await publishlyApiRequest(this, {
          method: 'GET',
          path: '/fleet-health',
          qs,
        });
      } else {
        throw new PublishlyNodeError(
          'unsupported_operation',
          `Publishly operation "${operation}" is not supported.`
        );
      }

      if (value === undefined) {
        throw new PublishlyNodeError(
          'empty_publishly_response',
          'Publishly returned an empty response.',
          'recoverable'
        );
      }
      output.push({ json: value, pairedItem: { item: index } });
    }
    return [output];
  }
}

module.exports = { Publishly };
