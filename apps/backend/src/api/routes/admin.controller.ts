import { Controller, Get, HttpException, Query } from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ErrorsService } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  isProviderConfigured,
  missingProviderEnv,
} from '@gitroom/nestjs-libraries/integrations/provider.env.registry';
import dayjs from 'dayjs';

const DAY_MS = 24 * 60 * 60 * 1000;

@ApiTags('Admin')
@Controller('/admin')
export class AdminController {
  constructor(
    private _errorsService: ErrorsService,
    private _adminStatsService: AdminStatsService,
    private _prisma: PrismaService
  ) {}

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }
  }

  private async temporalHealth() {
    let connection: import('@temporalio/client').Connection | undefined;
    try {
      const { Connection } = await import('@temporalio/client');
      connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
        ...(process.env.TEMPORAL_API_KEY
          ? { apiKey: process.env.TEMPORAL_API_KEY }
          : {}),
      });
      await Promise.race([
        connection.workflowService.describeNamespace({
          namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Temporal health timeout')), 2500)
        ),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      await connection?.close().catch(() => undefined);
    }
  }

  // Operational overview: dependency reachability, per-provider configuration
  // and queue concurrency, subscription counts, and read-only feature flags.
  // Never exposes secret values - only which env keys are missing.
  @Get('/system')
  async systemHealth(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);

    const timeout = <T>(p: Promise<T>, ms = 2500) =>
      Promise.race([
        p.then(() => true).catch(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
      ]);

    const [database, redis, subscriptions, organizations] = await Promise.all([
      timeout(this._prisma.organization.findFirst({ select: { id: true } })),
      timeout(ioRedis.ping()),
      this._prisma.subscription
        .groupBy({
          by: ['subscriptionTier'],
          where: { deletedAt: null },
          _count: true,
        })
        .catch(() => []),
      this._prisma.organization.count().catch(() => -1),
    ]);

    return {
      dependencies: { database, redis },
      organizations,
      subscriptions,
      providers: socialIntegrationList.map((p) => ({
        identifier: p.identifier,
        name: p.name,
        configured: isProviderConfigured(p.identifier),
        missingEnv: missingProviderEnv(p.identifier),
        queueConcurrency: p.maxConcurrentJob,
      })),
      flags: {
        registrationDisabled: process.env.DISABLE_REGISTRATION === 'true',
        billingEnabled: !!process.env.STRIPE_SECRET_KEY,
        emailProvider:
          process.env.EMAIL_PROVIDER ||
          (process.env.RESEND_API_KEY ? 'resend' : 'none'),
        storageProvider: process.env.STORAGE_PROVIDER || 'local',
        testProviderEnabled: process.env.ENABLE_TEST_PROVIDER === 'true',
        configStrict: process.env.CONFIG_STRICT === 'true',
      },
    };
  }

  @Get('/operations')
  async operations(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);

    const since = new Date(Date.now() - DAY_MS);
    const [
      temporal,
      users,
      organizations,
      memberships,
      integrations,
      integrationsByProvider,
      subscriptions,
      publishingStates,
      publishingFailures,
      media,
      apiKeys,
      recentlyUsedApiKeys,
      configuredWebhooks,
      inboundWebhookEvents,
      latestInboundWebhook,
      failedWebhookDeliveries,
      recentWebhookFailures,
      auditLogs,
      recentUsers,
      recentOrganizations,
    ] = await Promise.all([
      this.temporalHealth(),
      this._prisma.user.count(),
      this._prisma.organization.count(),
      this._prisma.userOrganization.count({ where: { disabled: false } }),
      this._prisma.integration.count({ where: { deletedAt: null } }),
      this._prisma.integration.groupBy({
        by: ['providerIdentifier'],
        where: { deletedAt: null },
        _count: true,
        orderBy: { _count: { providerIdentifier: 'desc' } },
      }),
      this._prisma.subscription.groupBy({
        by: ['subscriptionTier'],
        where: { deletedAt: null },
        _count: true,
      }),
      this._prisma.publishingJob.groupBy({
        by: ['state'],
        _count: true,
      }),
      this._prisma.publishingJob.findMany({
        where: { state: { in: ['FAILED', 'RETRYING'] } },
        select: {
          id: true,
          postId: true,
          provider: true,
          state: true,
          attempts: true,
          failureCategory: true,
          lastError: true,
          updatedAt: true,
          organization: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      this._prisma.media.aggregate({
        where: { deletedAt: null },
        _count: true,
        _sum: { fileSize: true, thumbnailFileSize: true },
      }),
      this._prisma.apiKey.count({ where: { revokedAt: null } }),
      this._prisma.apiKey.count({
        where: { revokedAt: null, lastUsedAt: { gte: since } },
      }),
      this._prisma.webhooks.count({ where: { deletedAt: null } }),
      this._prisma.processedWebhookEvent.count({
        where: { processedAt: { gte: since } },
      }),
      this._prisma.processedWebhookEvent.findFirst({
        select: { source: true, type: true, processedAt: true },
        orderBy: { processedAt: 'desc' },
      }),
      this._prisma.webhookDeliveryAttempt.count({
        where: { status: 'FAILED', createdAt: { gte: since } },
      }),
      this._prisma.webhookDeliveryAttempt.findMany({
        where: { status: 'FAILED' },
        select: {
          id: true,
          eventId: true,
          eventType: true,
          attempt: true,
          statusCode: true,
          error: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
          webhook: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this._prisma.auditLog.findMany({
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          actorType: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this._prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          lastName: true,
          activated: true,
          isSuperAdmin: true,
          createdAt: true,
          lastOnline: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this._prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: { users: true, Integration: true, post: true, media: true },
          },
          subscription: {
            select: { subscriptionTier: true, period: true, cancelAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      generatedAt: new Date(),
      dependencies: {
        database: true,
        redis: await ioRedis
          .ping()
          .then(() => true)
          .catch(() => false),
        temporal,
      },
      totals: { users, organizations, memberships, integrations },
      integrationsByProvider: integrationsByProvider.map((entry) => ({
        provider: entry.providerIdentifier,
        count: entry._count,
      })),
      subscriptions: subscriptions.map((entry) => ({
        tier: entry.subscriptionTier,
        count: entry._count,
      })),
      publishing: {
        states: publishingStates.map((entry) => ({
          state: entry.state,
          count: entry._count,
        })),
        recentFailures: publishingFailures.map((failure) => ({
          ...failure,
          // Provider responses can include user content. Keep operator output
          // bounded and never expose stored OAuth credentials.
          lastError: failure.lastError?.slice(0, 500) || null,
        })),
      },
      storage: {
        objects: media._count,
        bytes:
          Number(media._sum.fileSize || 0) +
          Number(media._sum.thumbnailFileSize || 0),
      },
      api: { activeKeys: apiKeys, usedLast24Hours: recentlyUsedApiKeys },
      webhooks: {
        configured: configuredWebhooks,
        inboundProcessedLast24Hours: inboundWebhookEvents,
        latestInbound: latestInboundWebhook,
        failedDeliveriesLast24Hours: failedWebhookDeliveries,
        recentFailures: recentWebhookFailures.map((failure) => ({
          ...failure,
          error: failure.error?.slice(0, 500) || null,
        })),
      },
      providers: socialIntegrationList.map((provider) => ({
        identifier: provider.identifier,
        name: provider.name,
        configured: isProviderConfigured(provider.identifier),
        missingEnv: missingProviderEnv(provider.identifier),
        queueConcurrency: provider.maxConcurrentJob,
      })),
      flags: {
        registrationDisabled: process.env.DISABLE_REGISTRATION === 'true',
        billingEnabled: !!process.env.STRIPE_SECRET_KEY,
        storageProvider: process.env.STORAGE_PROVIDER || 'local',
        testProviderEnabled: process.env.ENABLE_TEST_PROVIDER === 'true',
        configStrict: process.env.CONFIG_STRICT === 'true',
      },
      recentUsers,
      recentOrganizations,
      auditLogs,
    };
  }

  @Get('/errors')
  async listErrors(
    @GetUserFromRequest() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('email') email?: string,
    @Query('unknownFirst') unknownFirst?: string
  ) {
    this.assertSuperAdmin(user);
    return this._errorsService.listErrors({
      page: page ? parseInt(page, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
      platform: platform || undefined,
      email: email || undefined,
      unknownFirst: unknownFirst === 'true' || unknownFirst === '1',
    });
  }

  @Get('/errors/platforms')
  async listPlatforms(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._errorsService.listPlatforms();
  }

  @Get('/stats')
  async getStats(
    @GetUserFromRequest() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unknownOnly') unknownOnly?: string
  ) {
    this.assertSuperAdmin(user);

    const fromDate = from ? dayjs(from) : dayjs().subtract(30, 'day');
    const toDate = to ? dayjs(to) : dayjs();

    return this._adminStatsService.getStats({
      from: fromDate.startOf('day').toDate(),
      to: toDate.endOf('day').toDate(),
      unknownOnly: unknownOnly === 'true' || unknownOnly === '1',
    });
  }
}
