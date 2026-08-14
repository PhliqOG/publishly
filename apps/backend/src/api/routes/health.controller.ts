import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// Unauthenticated infrastructure probe (load balancers, uptime checks, compose
// healthchecks). Reports component reachability only - no versions of
// dependencies, no config values, no secrets. Temporal health is owned by the
// orchestrator's /health/status endpoint.
@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private _prisma: PrismaService) {}

  @Get(['/health', '/readiness'])
  async health(@Res() res: Response) {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const healthy = Object.values(checks).every(Boolean);
    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks,
    });
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await Promise.race([
        this._prisma.organization.findFirst({ select: { id: true } }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('db timeout')), 2500)
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pong = await Promise.race([
        ioRedis.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('redis timeout')), 2500)
        ),
      ]);
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
