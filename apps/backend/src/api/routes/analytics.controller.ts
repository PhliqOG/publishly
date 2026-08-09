import { Controller, Get, Param, Query } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AnalyticsSnapshotRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics-snapshot.repository';

@ApiTags('Analytics')
@Controller('/analytics')
export class AnalyticsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _analyticsSnapshotRepository: AnalyticsSnapshotRepository
  ) {}

  // Stored history of platform-reported metrics (beyond providers' own
  // lookback windows). Values are returned exactly as captured - days without
  // a snapshot are simply absent, never interpolated.
  @Get('/history/:integration')
  async getHistory(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('label') label?: string,
    @Query('days') days?: string
  ) {
    return this._analyticsSnapshotRepository.history(
      org.id,
      integration,
      label,
      Math.min(365, Math.max(1, parseInt(days || '90', 10) || 90))
    );
  }

  @Get('/:integration')
  async getIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  @Get('/post/:postId')
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }
}
