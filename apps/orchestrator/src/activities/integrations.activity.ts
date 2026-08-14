import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { Integration } from '@prisma/client';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { ConnectionHealthService } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service';
import { PlatformTruthService } from '@gitroom/nestjs-libraries/database/prisma/platform-truth/platform-truth.service';
import { PublicStatusService } from '@gitroom/nestjs-libraries/database/prisma/public-status/public-status.service';

@Injectable()
@Activity()
export class IntegrationsActivity {
  constructor(
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _connectionHealth: ConnectionHealthService,
    private _platformTruth: PlatformTruthService,
    private _publicStatus: PublicStatusService
  ) {}

  @ActivityMethod()
  async getIntegrationsById(id: string, orgId: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  async refreshToken(integration: Integration) {
    return this._refreshIntegrationService.refresh(integration);
  }

  @ActivityMethod()
  evaluateConnectionHealthFleetV101() {
    return this._connectionHealth.evaluateAll();
  }

  @ActivityMethod()
  evaluatePlatformTruthFleetV101() {
    return this._platformTruth.evaluateAll();
  }

  @ActivityMethod()
  recordPublishingEngineHeartbeatV101() {
    return this._publicStatus.recordPublishingEngineHeartbeat();
  }
}
