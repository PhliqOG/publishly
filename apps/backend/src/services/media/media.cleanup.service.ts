import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import crypto from 'node:crypto';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(private _mediaService: MediaService) {}

  @Cron('0 20 3 * * *', { timeZone: 'UTC' })
  async cleanDeletedMedia() {
    if (process.env.RUN_CRON !== 'true') return;

    const token = crypto.randomUUID();
    const lockKey = 'publishly:lock:media-cleanup';
    const acquired = await ioRedis.set(
      lockKey,
      token,
      'PX',
      30 * 60 * 1000,
      'NX'
    );
    if (acquired !== 'OK') return;

    try {
      const parsed = Number(process.env.MEDIA_DELETE_RETENTION_DAYS || 30);
      const retentionDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
      const result = await this._mediaService.cleanupDeletedMedia(
        retentionDays
      );
      this.logger.log({ event: 'media_cleanup.completed', ...result });
    } catch (error) {
      this.logger.error({
        event: 'media_cleanup.failed',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    } finally {
      await ioRedis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        token
      );
    }
  }
}
