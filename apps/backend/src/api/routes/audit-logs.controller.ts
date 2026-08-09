import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Audit Logs')
@Controller('/audit-logs')
export class AuditLogsController {
  constructor(private _auditLogService: AuditLogService) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  list(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string
  ) {
    return this._auditLogService.list(
      org.id,
      Math.max(1, parseInt(page || '1', 10) || 1),
      action,
      userId
    );
  }
}
