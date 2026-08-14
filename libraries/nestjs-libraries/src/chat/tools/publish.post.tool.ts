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
export class PublishPostTool implements AgentToolInterface {
  constructor(private _creation: ReliablePostCreationService) {}
  name = 'publishPost';

  run() {
    return createTool({
      id: 'publish_post',
      description:
        'Publish a post now through Publishly. The request is provider-preflighted and durably idempotent; API acceptance is not a confirmed-live receipt.',
      mcp: {
        annotations: {
          title: 'Publish Post Now',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object(mcpPostFields),
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
          const result = await this._creation.create({
            organizationId: organization.id,
            organizationCreatedAt: new Date(organization.createdAt),
            rawBody: rawPostBody(inputData, new Date().toISOString()),
            type: 'now',
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
