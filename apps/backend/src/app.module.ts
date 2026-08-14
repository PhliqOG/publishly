import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { ApiModule } from '@gitroom/backend/api/api.module';
import { APP_GUARD } from '@nestjs/core';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';
import { PublicApiModule } from '@gitroom/backend/public-api/public.api.module';
import { ThrottlerBehindProxyGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgentModule } from '@gitroom/nestjs-libraries/agent/agent.module';
import { ThirdPartyModule } from '@gitroom/nestjs-libraries/3rdparties/thirdparty.module';
import { VideoModule } from '@gitroom/nestjs-libraries/videos/video.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { FILTER } from '@gitroom/nestjs-libraries/sentry/sentry.exception';
import { ChatModule } from '@gitroom/nestjs-libraries/chat/chat.module';
import { getTemporalModule } from '@gitroom/nestjs-libraries/temporal/temporal.module';
import { TemporalRegisterMissingSearchAttributesModule } from '@gitroom/nestjs-libraries/temporal/temporal.register';
import { InfiniteWorkflowRegisterModule } from '@gitroom/nestjs-libraries/temporal/infinite.workflow.register';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { ScheduleModule } from '@nestjs/schedule';
import { MediaCleanupService } from '@gitroom/backend/services/media/media.cleanup.service';
import { StatusProbeService } from '@gitroom/backend/services/status/status-probe.service';

@Global()
@Module({
  imports: [
    SentryModule.forRoot(),
    DatabaseModule,
    ApiModule,
    PublicApiModule,
    AgentModule,
    ThirdPartyModule,
    VideoModule,
    ChatModule,
    getTemporalModule(false),
    TemporalRegisterMissingSearchAttributesModule,
    InfiniteWorkflowRegisterModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 3600000,
          limit: process.env.API_LIMIT ? Number(process.env.API_LIMIT) : 90,
        },
      ],
      // Omitting storage selects Nest's in-memory throttler. Passing the mock
      // Redis object to ThrottlerStorageRedisService would be interpreted as
      // ioredis connection options and silently reconnect to localhost:6379.
      ...(process.env.REDIS_DISABLED !== 'true' && process.env.REDIS_URL
        ? { storage: new ThrottlerStorageRedisService(ioRedis) }
        : {}),
    }),
  ],
  controllers: [],
  providers: [
    FILTER,
    MediaCleanupService,
    StatusProbeService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PoliciesGuard,
    },
  ],
  exports: [
    DatabaseModule,
    ApiModule,
    PublicApiModule,
    AgentModule,
    ThrottlerModule,
    ChatModule,
  ],
})
export class AppModule {}
