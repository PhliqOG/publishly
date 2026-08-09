import {
  Controller,
  Get,
  HttpException,
  Query,
} from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ErrorsService } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  socialIntegrationList,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  isProviderConfigured,
  missingProviderEnv,
} from '@gitroom/nestjs-libraries/integrations/provider.env.registry';
import dayjs from 'dayjs';

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

  // Operational overview: dependency reachability, per-provider configuration
  // and queue concurrency, subscription counts, and read-only feature flags.
  // Never exposes secret values - only which env keys are missing.
  @Get('/system')
  async systemHealth(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);

    const timeout = <T,>(p: Promise<T>, ms = 2500) =>
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
        emailProvider: process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'none'),
        storageProvider: process.env.STORAGE_PROVIDER || 'local',
        testProviderEnabled: process.env.ENABLE_TEST_PROVIDER === 'true',
        configStrict: process.env.CONFIG_STRICT === 'true',
      },
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
