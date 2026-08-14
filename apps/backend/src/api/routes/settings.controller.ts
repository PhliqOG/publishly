import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { OrgDataService } from '@gitroom/nestjs-libraries/database/prisma/organizations/org-data.service';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { AdminAddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/admin.add.team.member.dto';
import { ShortlinkPreferenceDto } from '@gitroom/nestjs-libraries/dtos/settings/shortlink-preference.dto';
import { TransferOwnershipDto } from '@gitroom/nestjs-libraries/dtos/settings/transfer.ownership.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Settings')
@Controller('/settings')
export class SettingsController {
  constructor(
    private _organizationService: OrganizationService,
    private _auditLogService: AuditLogService,
    private _orgDataService: OrgDataService
  ) {}

  @Get('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async getTeam(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getTeam(org.id);
  }

  @Post('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async inviteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: AddTeamMemberDto
  ) {
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'team.member-invited',
      targetType: 'invite',
      metadata: { email: body.email, role: body.role },
    });
    return this._organizationService.inviteTeamMember(org, user, body);
  }

  @Post('/team/add')
  async addTeamMember(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Body() body: AdminAddTeamMemberDto
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return this._organizationService.addTeamMemberByEmail(org, body);
  }

  @Delete('/team/:id')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  deleteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'team.member-removed',
      targetType: 'user',
      targetId: id,
    });
    return this._organizationService.deleteTeamMember(org, id);
  }

  @Post('/team/transfer-ownership')
  @CheckPolicies([AuthorizationActions.Update, Sections.OWNER])
  async transferOwnership(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: TransferOwnershipDto
  ) {
    const transferred = await this._organizationService.transferOwnership(
      org.id,
      user.id,
      body.userId
    );
    if (!transferred) {
      throw new HttpException(
        'Ownership can only be transferred to an active workspace member',
        400
      );
    }
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'team.ownership-transferred',
      targetType: 'user',
      targetId: body.userId,
    });
    return { transferred: true };
  }

  // Full workspace export (no secrets - tokens are excluded by construction).
  @Get('/export')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async exportOrganization(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'org.data-exported',
    });
    return this._orgDataService.exportData(org.id);
  }

  // Destroys credentials immediately, soft-deletes content, disables members.
  @Delete('/organization')
  @CheckPolicies([AuthorizationActions.Delete, Sections.OWNER])
  async deleteOrganization(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'org.deletion-requested',
    });
    return this._orgDataService.requestDeletion(org.id);
  }

  @Get('/shortlink')
  async getShortlinkPreference(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getShortlinkPreference(org.id);
  }

  @Post('/shortlink')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateShortlinkPreference(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ShortlinkPreferenceDto
  ) {
    return this._organizationService.updateShortlinkPreference(
      org.id,
      body.shortlink
    );
  }
}
