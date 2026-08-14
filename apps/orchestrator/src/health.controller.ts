import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { OrchestratorHealthService } from '@gitroom/orchestrator/orchestrator-health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly _health: OrchestratorHealthService) {}

  @Get('/status')
  async getHealthStatus(@Res() res: Response) {
    const result = await this._health.check();
    return res.status(result.healthy ? 200 : 503).json(result);
  }
}
