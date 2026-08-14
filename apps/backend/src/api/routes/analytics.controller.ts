import { Controller, Get, Param, Query } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AnalyticsSnapshotRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics-snapshot.repository';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

@ApiTags('Analytics')
@Controller('/analytics')
export class AnalyticsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _analyticsSnapshotRepository: AnalyticsSnapshotRepository,
    private _subscriptionService: SubscriptionService
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
    const subscription = await this._subscriptionService.getSubscription(
      org.id
    );
    const tier =
      subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? 'ULTIMATE' : 'FREE');
    const retentionDays = pricing[tier].analytics_retention_days;
    const requestedDays = Math.min(
      retentionDays,
      Math.max(1, parseInt(days || '90', 10) || 90)
    );
    await this._analyticsSnapshotRepository.prune(org.id, retentionDays);
    return this._analyticsSnapshotRepository.history(
      org.id,
      integration,
      label,
      requestedDays
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
