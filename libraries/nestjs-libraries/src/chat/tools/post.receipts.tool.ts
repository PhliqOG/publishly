import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { requireMcpOrganization } from '../mcp.auth.policy';
import { asMcpToolError, McpToolError } from '../mcp.tool.error';

@Injectable()
export class PostReceiptsTool implements AgentToolInterface {
  constructor(private _posts: PostsService) {}
  name = 'postReceipts';

  run() {
    return createTool({
      id: 'get_post_receipts',
      description:
        'Get the durable per-platform lifecycle, retry state, and classified failure evidence for a Publishly post.',
      mcp: {
        annotations: {
          title: 'Get Post Delivery Receipts',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        postId: z.string().min(1).describe('Publishly destination post ID'),
      }),
      outputSchema: z.object({
        postId: z.string(),
        state: z.string(),
        latestStage: z.string().nullable(),
        attempts: z.number(),
        nextAttemptAt: z.any().nullable(),
        failure: z.any().nullable(),
        receipts: z.array(z.any()),
      }),
      execute: async (inputData, context) => {
        try {
          const organization = requireMcpOrganization(
            inputData,
            context,
            'posts:read'
          );
          const job = await this._posts.getPublishingJob(
            organization.id,
            inputData.postId
          );
          if (!job) {
            throw new McpToolError(
              'publishing_job_not_found',
              'No publishing job exists for this post in the current workspace.'
            );
          }
          return {
            postId: inputData.postId,
            state: job.state,
            latestStage: job.deliveryStage,
            attempts: job.attempts,
            nextAttemptAt: job.nextAttemptAt,
            failure: job.failureCode
              ? {
                  class: job.failureClass,
                  code: job.failureCode,
                  reason: job.failureReason,
                }
              : null,
            receipts: await this._posts.listDeliveryReceipts(
              organization.id,
              inputData.postId
            ),
          };
        } catch (error) {
          throw asMcpToolError(error);
        }
      },
    });
  }
}
