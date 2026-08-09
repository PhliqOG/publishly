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
    private _auditLogService: AuditLogService
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
        };
      });
  }

  @Get('/:integrationId')
  async comments(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query('page') page?: string,
    @Query('postId') postId?: string
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
      return await provider.listComments(
        openedIntegration.token,
        openedIntegration,
        {
          page: page ? parseInt(page, 10) : undefined,
          postId,
        }
      );
    } catch (err: any) {
      throw new HttpException(
        { msg: 'The platform rejected the comments request' },
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
      throw new HttpException(
        { msg: 'The platform rejected the reply' },
        502
      );
    }
  }
}
