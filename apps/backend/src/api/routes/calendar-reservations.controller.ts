import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';

@ApiTags('Calendar reservations')
@Controller('/calendar/reservations')
export class CalendarReservationsController {
  constructor(private _reservations: CalendarReservationService) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  list(
    @GetOrgFromRequest() organization: Organization,
    @Query('mode') mode?: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this._reservations.list({
      organizationId: organization.id,
      mode,
      state,
      cursor,
      limit,
    });
  }

  @Get('/backfill')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  getBackfill(@GetOrgFromRequest() organization: Organization) {
    return this._reservations.getBackfill(organization.id);
  }

  @Post('/backfill/batches')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  runBackfillBatch(
    @GetOrgFromRequest() organization: Organization,
    @Query('limit') limit?: string
  ) {
    return this._reservations.runBackfillBatch(organization.id, limit);
  }

  @Post('/backfill/verify')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  verifyBackfill(@GetOrgFromRequest() organization: Organization) {
    return this._reservations.verifyBackfill(organization.id);
  }

  @Post('/authority/batches')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  promoteAuthorityBatch(
    @GetOrgFromRequest() organization: Organization,
    @Query('limit') limit?: string
  ) {
    return this._reservations.promoteAuthorityBatch(organization.id, limit, {
      actorType: 'user',
    });
  }
}
