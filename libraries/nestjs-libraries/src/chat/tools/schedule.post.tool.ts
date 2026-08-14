import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { ReliablePostCreationService } from '@gitroom/nestjs-libraries/database/prisma/posts/reliable-post-creation.service';
import { requireMcpOrganization } from '../mcp.auth.policy';
import { asMcpToolError, McpToolError } from '../mcp.tool.error';
import { validateIdempotencyKey } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import {
  mcpPostFields,
  mcpPostResultSchema,
  rawPostBody,
} from './mcp.post.schema';

@Injectable()
export class SchedulePostTool implements AgentToolInterface {
  constructor(private _creation: ReliablePostCreationService) {}
  name = 'schedulePost';

  run() {
    return createTool({
      id: 'schedule_post',
      description:
        'Schedule a post through Publishly with provider preflight, per-account queueing, and durable idempotency.',
      mcp: {
        annotations: {
          title: 'Schedule Post',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        ...mcpPostFields,
        scheduledAt: z
          .string()
          .describe('ISO 8601 date and time for the scheduled delivery'),
      }),
      outputSchema: mcpPostResultSchema,
      execute: async (inputData, context) => {
        try {
          const organization = requireMcpOrganization(
            inputData,
            context,
            'posts:write'
          );
          if (!validateIdempotencyKey(inputData.idempotencyKey)) {
            throw new McpToolError(
              'invalid_idempotency_key',
              'Idempotency key is required and must be 8-200 characters using letters, numbers, dot, underscore, colon, or hyphen.'
            );
          }
          const scheduledAt = new Date(inputData.scheduledAt);
          if (Number.isNaN(scheduledAt.getTime())) {
            throw new McpToolError(
              'invalid_schedule_date',
              'scheduledAt must be a valid ISO 8601 date and time.'
            );
          }
          const result = await this._creation.create({
            organizationId: organization.id,
            organizationCreatedAt: new Date(organization.createdAt),
            rawBody: rawPostBody(inputData, scheduledAt.toISOString()),
            type: 'schedule',
            idempotencyKey: inputData.idempotencyKey,
            creationMethod: 'MCP',
          });
          return {
            output: result.value,
            idempotencyReplayed: result.replayed,
          };
        } catch (error) {
          throw asMcpToolError(error);
        }
      },
    });
  }
}
