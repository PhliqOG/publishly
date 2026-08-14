import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { ReplyCommentDto } from '@gitroom/nestjs-libraries/dtos/inbox/reply.comment.dto';
import { ReplyDirectMessageDto } from '@gitroom/nestjs-libraries/dtos/inbox/reply.direct.message.dto';
import { UpdateInboxStateDto } from '@gitroom/nestjs-libraries/dtos/inbox/update.inbox.state.dto';
import { InboxStateRepository } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox-state.repository';
import { withOpenToken } from '@gitroom/helpers/auth/crypto.v2';

// Unified inbox. Capability-gated: a channel is only readable/replyable when
// its provider implements the official comments API - the UI shows the rest
// as honestly unsupported instead of faking anything.
@ApiTags('Inbox')
@Controller('/inbox')
export class InboxController {
  constructor(
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _auditLogService: AuditLogService,
    private _inboxStateRepository: InboxStateRepository
  ) {}

  @Get('/channels')
  async channels(@GetOrgFromRequest() org: Organization) {
    const integrations = await this._integrationService.getIntegrationsList(
      org.id
    );
    return integrations
      .filter((i) => !i.disabled && i.type === 'social')
      .map((i) => {
        const provider = this._integrationManager.getSocialIntegration(
          i.providerIdentifier
        );
        return {
          id: i.id,
          name: i.name,
          picture: i.picture,
          providerIdentifier: i.providerIdentifier,
          supportsInbox: !!provider?.listComments,
          supportsReplies: !!provider?.replyToComment,
          supportsDirectMessages: !!provider?.listDirectMessages,
          supportsDirectMessageReplies: !!provider?.sendDirectMessage,
        };
      });
  }

  @Get('/:integrationId/messages')
  async directMessages(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query('page') page?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'open' | 'unread' | 'resolved',
    @Query('assignedTo') assignedTo?: string
  ) {
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Channel not found', 404);
    }
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.listDirectMessages) {
      throw new HttpException(
        {
          supported: false,
          msg: `${integration.providerIdentifier} does not expose an official direct-messages API`,
        },
        400
      );
    }

    try {
      const openedIntegration = withOpenToken(integration);
      const result = await provider.listDirectMessages(
        openedIntegration.token,
        openedIntegration,
        { page: page ? parseInt(page, 10) : undefined }
      );
      const states = await this._inboxStateRepository.list(
        org.id,
        integrationId,
        result.messages.map((message) => String(message.id))
      );
      const byMessage = new Map(
        states.map((state) => [state.externalCommentId, state] as const)
      );
      const needle = search?.trim().toLocaleLowerCase().slice(0, 120);
      const messages = result.messages
        .map((message) => {
          const state = byMessage.get(String(message.id));
          return {
            ...message,
            workflow: {
              isRead: !!state?.readAt,
              resolved: !!state?.resolvedAt,
              assignedUserId: state?.assignedUserId || null,
              assignedUser: state?.assignedUser || null,
              internalNote: state?.internalNote || '',
            },
          };
        })
        .filter((message) => {
          if (
            needle &&
            !`${message.message} ${message.author?.name || ''} ${
              message.author?.username || ''
            }`
              .toLocaleLowerCase()
              .includes(needle)
          ) {
            return false;
          }
          if (status === 'unread' && message.workflow.isRead) return false;
          if (status === 'resolved' && !message.workflow.resolved) return false;
          if (status === 'open' && message.workflow.resolved) return false;
          if (assignedTo && message.workflow.assignedUserId !== assignedTo) {
            return false;
          }
          return true;
        });

      return { ...result, messages };
    } catch {
      throw new HttpException(
        { msg: 'The platform rejected the direct-messages request' },
        502
      );
    }
  }

  @Get('/:integrationId')
  async comments(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query('page') page?: string,
    @Query('postId') postId?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'open' | 'unread' | 'resolved',
    @Query('assignedTo') assignedTo?: string
  ) {
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Channel not found', 404);
    }

    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.listComments) {
      throw new HttpException(
        {
          supported: false,
          msg: `${integration.providerIdentifier} does not expose a comments API we can use yet`,
        },
        400
      );
    }

    try {
      const openedIntegration = withOpenToken(integration);
      const result = await provider.listComments(
        openedIntegration.token,
        openedIntegration,
        {
          page: page ? parseInt(page, 10) : undefined,
          postId,
        }
      );
      const states = await this._inboxStateRepository.list(
        org.id,
        integrationId,
        result.comments.map((comment) => String(comment.id))
      );
      const byComment = new Map(
        states.map((state) => [state.externalCommentId, state] as const)
      );
      const needle = search?.trim().toLocaleLowerCase().slice(0, 120);

      const comments = result.comments
        .map((comment) => {
          const state = byComment.get(String(comment.id));
          return {
            ...comment,
            workflow: {
              isRead: !!state?.readAt,
              resolved: !!state?.resolvedAt,
              assignedUserId: state?.assignedUserId || null,
              assignedUser: state?.assignedUser || null,
              internalNote: state?.internalNote || '',
            },
          };
        })
        .filter((comment) => {
          if (
            needle &&
            !`${comment.message} ${comment.author?.name || ''} ${
              comment.author?.username || ''
            }`
              .toLocaleLowerCase()
              .includes(needle)
          ) {
            return false;
          }
          if (status === 'unread' && comment.workflow.isRead) return false;
          if (status === 'resolved' && !comment.workflow.resolved) return false;
          if (status === 'open' && comment.workflow.resolved) return false;
          if (assignedTo && comment.workflow.assignedUserId !== assignedTo) {
            return false;
          }
          return true;
        });

      return { ...result, comments };
    } catch (err: any) {
      throw new HttpException(
        { msg: 'The platform rejected the comments request' },
        502
      );
    }
  }

  @Post('/:integrationId/:commentId/state')
  async updateState(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Param('integrationId') integrationId: string,
    @Param('commentId') commentId: string,
    @Body() body: UpdateInboxStateDto
  ) {
    if (!commentId || commentId.length > 255) {
      throw new HttpException('Invalid comment id', 400);
    }
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Channel not found', 404);
    }
    if (
      body.assignedUserId &&
      !(await this._inboxStateRepository.assertWorkspaceMember(
        org.id,
        body.assignedUserId
      ))
    ) {
      throw new HttpException(
        'Assignee is not an active workspace member',
        400
      );
    }

    const state = await this._inboxStateRepository.update(
      org.id,
      integrationId,
      commentId,
      body
    );
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'inbox.state-updated',
      targetType: 'inbox-item',
      targetId: commentId,
      metadata: {
        integrationId,
        changed: Object.keys(body),
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return {
      isRead: !!state.readAt,
      resolved: !!state.resolvedAt,
      assignedUserId: state.assignedUserId,
      assignedUser: state.assignedUser,
      internalNote: state.internalNote || '',
    };
  }

  @Post('/:integrationId/messages/reply')
  async replyToDirectMessage(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Param('integrationId') integrationId: string,
    @Body() body: ReplyDirectMessageDto
  ) {
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Channel not found', 404);
    }
    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.sendDirectMessage) {
      throw new HttpException(
        {
          supported: false,
          msg: `${integration.providerIdentifier} does not support direct-message replies via an official API`,
        },
        400
      );
    }

    try {
      const openedIntegration = withOpenToken(integration);
      const result = await provider.sendDirectMessage(
        openedIntegration.token,
        openedIntegration,
        body.threadId,
        body.recipientId,
        body.message
      );
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'inbox.direct-message-reply-sent',
        targetType: 'integration',
        targetId: integrationId,
        metadata: {
          threadId: body.threadId,
          recipientId: body.recipientId,
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return result;
    } catch {
      throw new HttpException(
        {
          msg: 'Instagram rejected the message. The 24-hour response window may have closed.',
        },
        502
      );
    }
  }

  @Post('/:integrationId/reply')
  async reply(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Param('integrationId') integrationId: string,
    @Body() body: ReplyCommentDto
  ) {
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Channel not found', 404);
    }

    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.replyToComment) {
      throw new HttpException(
        {
          supported: false,
          msg: `${integration.providerIdentifier} does not support replies via API yet`,
        },
        400
      );
    }

    try {
      const openedIntegration = withOpenToken(integration);
      const result = await provider.replyToComment(
        openedIntegration.token,
        openedIntegration,
        body.commentId,
        body.message,
        body.postId
      );
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'inbox.reply-sent',
        targetType: 'integration',
        targetId: integrationId,
        metadata: { commentId: body.commentId },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return result;
    } catch (err: any) {
      throw new HttpException({ msg: 'The platform rejected the reply' }, 502);
    }
  }
}
