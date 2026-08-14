import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PublicStatusService } from '@gitroom/nestjs-libraries/database/prisma/public-status/public-status.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

@Injectable()
export class StatusProbeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StatusProbeService.name);

  constructor(
    private _prisma: PrismaService,
    private _status: PublicStatusService
  ) {}

  async onApplicationBootstrap() {
    if (process.env.RUN_CRON !== 'true') return;
    try {
      await this.runProbe();
    } catch (error) {
      this.logger.error({
        event: 'status_probe_bootstrap_failed',
        code: 'status_probe_bootstrap_failed',
        reason: normalizePostFailure({ error }).reason,
      });
      throw error;
    }
  }

  private async timedProbe(operation: () => Promise<unknown>) {
    const started = Date.now();
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        operation(),
        new Promise(
          (_, reject) =>
            (timeout = setTimeout(
              () => reject(new Error('probe timeout')),
              2_500
            ))
        ),
      ]);
      return { ok: true as const, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false as const,
        latencyMs: Date.now() - started,
        reason: normalizePostFailure({ error }).reason,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async runProbe(observedAt = new Date()) {
    const [database, redis] = await Promise.all([
      this.timedProbe(() =>
        this._prisma.organization.findFirst({ select: { id: true } })
      ),
      this.timedProbe(async () => {
        const pong = await ioRedis.ping();
        if (pong !== 'PONG') throw new Error('Redis did not return PONG.');
      }),
    ]);

    await this._status.recordSamples(
      [
        {
          component: 'api',
          status: 'OPERATIONAL',
          latencyMs: 0,
          code: 'api_probe_completed',
          reason: 'The Publishly API completed its scheduled health probe.',
        },
        {
          component: 'database',
          status: database.ok ? 'OPERATIONAL' : 'OUTAGE',
          latencyMs: database.latencyMs,
          code: database.ok ? 'database_reachable' : 'database_unreachable',
          reason: database.ok
            ? 'The primary database answered the scheduled health probe.'
            : `The primary database probe failed: ${database.reason}`,
        },
        {
          component: 'redis',
          status: redis.ok ? 'OPERATIONAL' : 'OUTAGE',
          latencyMs: redis.latencyMs,
          code: redis.ok ? 'redis_reachable' : 'redis_unreachable',
          reason: redis.ok
            ? 'Redis answered the scheduled health probe.'
            : `The Redis probe failed: ${redis.reason}`,
        },
      ],
      observedAt
    );
    return { database, redis };
  }

  @Cron('5 * * * * *', { timeZone: 'UTC' })
  async scheduledProbe() {
    if (process.env.RUN_CRON !== 'true') return;
    try {
      await this.runProbe();
    } catch (error) {
      this.logger.error({
        event: 'status_probe_write_failed',
        code: 'status_probe_write_failed',
        reason: normalizePostFailure({ error }).reason,
      });
    }
  }

  @Cron('0 30 4 * * *', { timeZone: 'UTC' })
  async scheduledCleanup() {
    if (process.env.RUN_CRON !== 'true') return;
    try {
      await this._status.cleanup();
    } catch (error) {
      this.logger.error({
        event: 'status_probe_cleanup_failed',
        code: 'status_probe_cleanup_failed',
        reason: normalizePostFailure({ error }).reason,
      });
    }
  }
}
