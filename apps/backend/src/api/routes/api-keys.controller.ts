import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ApiKeysService } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { CreateApiKeyDto } from '@gitroom/nestjs-libraries/dtos/api-keys/create.api.key.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('API Keys')
@Controller('/api-keys')
export class ApiKeysController {
  constructor(
    private _apiKeysService: ApiKeysService,
    private _auditLogService: AuditLogService
  ) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  list(@GetOrgFromRequest() org: Organization) {
    return this._apiKeysService.getKeys(org.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Body() body: CreateApiKeyDto
  ) {
    const created = await this._apiKeysService.createKey(
      org.id,
      body.name,
      body.scopes
    );
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'api-key.created',
      targetType: 'apiKey',
      targetId: created.id,
      metadata: { name: body.name, scopes: body.scopes },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async revoke(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Param('id') id: string
  ) {
    const { count } = await this._apiKeysService.revoke(org.id, id);
    if (count > 0) {
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'api-key.revoked',
        targetType: 'apiKey',
        targetId: id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    return { revoked: count > 0 };
  }
}
