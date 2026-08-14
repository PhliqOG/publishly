import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  OnlyURL,
  UpdateDto,
  WebhooksDto,
} from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

@ApiTags('Webhooks')
@Controller('/webhooks')
export class WebhookController {
  constructor(private _webhooksService: WebhooksService) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  async getStatistics(@GetOrgFromRequest() org: Organization) {
    return this._webhooksService.getWebhooks(org.id);
  }

  @Post('/')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.WEBHOOKS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async createAWebhook(
    @GetOrgFromRequest() org: Organization,
    @Body() body: WebhooksDto
  ) {
    return this._webhooksService.createWebhook(org.id, body);
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async updateWebhook(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UpdateDto
  ) {
    return this._webhooksService.createWebhook(org.id, body);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async deleteWebhook(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const deleted = await this._webhooksService.deleteWebhook(org.id, id);
    if (!deleted) {
      throw new NotFoundException('Webhook not found');
    }
    return { deleted: true };
  }

  @Post('/:id/rotate-secret')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async rotateSecret(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const result = await this._webhooksService.rotateSigningSecret(org.id, id);
    if (!result) {
      throw new NotFoundException('Webhook not found');
    }
    return result;
  }

  @Post('/send')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async sendWebhook(@Body() body: any, @Query() query: OnlyURL) {
    try {
      const response = await fetch(query.url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        // @ts-ignore -- Undici extension not present in lib.dom's RequestInit.
        dispatcher: getSsrfSafeDispatcher(),
      });
      return { sent: response.ok, statusCode: response.status };
    } catch (err) {
      return { sent: false, statusCode: null };
    }
  }
}
