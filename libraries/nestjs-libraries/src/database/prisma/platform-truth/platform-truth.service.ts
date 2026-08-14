import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { open as openSealed } from '@gitroom/helpers/auth/crypto.v2';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { ConnectionHealthService } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  failedPlatformTruth,
  PlatformPreflightIssue,
  PlatformTruthInspectionError,
  PlatformTruthSnapshot,
  platformTruthResponse,
} from '@gitroom/nestjs-libraries/reliability/platform.truth';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

@Injectable()
export class PlatformTruthService {
  private readonly logger = new Logger(PlatformTruthService.name);

  constructor(
    private _integrations: IntegrationRepository,
    private _manager: IntegrationManager,
    private _connectionHealth: ConnectionHealthService
  ) {}

  private response(snapshot: PlatformTruthSnapshot) {
    return platformTruthResponse({
      platformTruthState: snapshot.state,
      platformPublishingMode: snapshot.publishingMode,
      platformAuditState: snapshot.auditState,
      platformTruthCode: snapshot.code,
      platformTruthReason: snapshot.reason,
      platformTruthCheckedAt: snapshot.checkedAt,
      platformAccountType: snapshot.accountType,
      platformLinkedResourceId: snapshot.linkedResourceId,
      platformTruthMetadata: snapshot.metadata,
    });
  }

  private inspectionFailure(
    provider: string,
    error: unknown
  ): PlatformPreflightIssue {
    if (error instanceof PlatformTruthInspectionError) {
      return {
        failureClass: error.failureClass,
        code: error.code,
        reason: error.message,
      };
    }
    const normalized = normalizePostFailure({
      error,
      code: error instanceof RefreshToken ? 'reconnect_required' : undefined,
      willRetry: !(error instanceof RefreshToken),
    });
    if (error instanceof RefreshToken) {
      return {
        failureClass: 'user_action_needed',
        code: `${provider}_reconnect_required`,
        reason: normalized.reason,
      };
    }
    return {
      failureClass:
        normalized.failureClass === 'user_action_needed'
          ? 'user_action_needed'
          : 'recoverable',
      code:
        normalized.failureClass === 'user_action_needed'
          ? `${provider}_platform_access_required`
          : `${provider}_platform_truth_unavailable`,
      reason: normalized.reason,
    };
  }

  async recordSnapshot(
    integration: Integration,
    snapshot: PlatformTruthSnapshot
  ) {
    await this._connectionHealth.recordPlatformTruth(integration, snapshot);
    return this.response(snapshot);
  }

  async refreshIntegration(integration: Integration) {
    const provider = this._manager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider.inspectPlatformTruth) {
      const snapshot: PlatformTruthSnapshot = {
        state: 'NOT_APPLICABLE',
        publishingMode: 'NOT_APPLICABLE',
        auditState: 'NOT_APPLICABLE',
        code: 'platform_truth_not_applicable',
        reason:
          'This provider does not require a separate platform-truth capability check.',
        checkedAt: new Date(),
      };
      return {
        snapshot,
        response: await this.recordSnapshot(integration, snapshot),
        failure: null,
      };
    }

    let snapshot: PlatformTruthSnapshot;
    let failure: PlatformPreflightIssue | null = null;
    try {
      snapshot = await provider.inspectPlatformTruth(
        openSealed(integration.token),
        integration
      );
    } catch (error) {
      failure = this.inspectionFailure(integration.providerIdentifier, error);
      snapshot = failedPlatformTruth(integration.providerIdentifier, failure);
      this.logger.warn({
        event: 'platform_truth_inspection_failed',
        organizationId: integration.organizationId,
        integrationId: integration.id,
        provider: integration.providerIdentifier,
        failureClass: failure.failureClass,
        code: failure.code,
        reason: failure.reason,
      });
    }
    return {
      snapshot,
      response: await this.recordSnapshot(integration, snapshot),
      failure,
    };
  }

  async refreshConnection(organizationId: string, integrationId: string) {
    const integration = await this._integrations.getIntegrationById(
      organizationId,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException({
        code: 'connection_not_found',
        reason: 'This connection was not found in the current workspace.',
      });
    }
    return this.refreshIntegration(integration);
  }

  async evaluateAll() {
    const integrations =
      await this._integrations.listPlatformTruthConnections();
    const failures: string[] = [];
    let ready = 0;
    let limited = 0;
    let invalid = 0;
    let unknown = 0;
    for (const integration of integrations) {
      try {
        const result = await this.refreshIntegration(integration);
        if (result.snapshot.state === 'READY') ready += 1;
        else if (result.snapshot.state === 'LIMITED') limited += 1;
        else if (result.snapshot.state === 'INVALID') invalid += 1;
        else unknown += 1;
      } catch (error) {
        const reason = normalizePostFailure({ error }).reason;
        failures.push(`${integration.id}: ${reason}`);
        this.logger.error({
          event: 'platform_truth_refresh_failed',
          organizationId: integration.organizationId,
          integrationId: integration.id,
          provider: integration.providerIdentifier,
          reason,
        });
      }
    }
    if (failures.length) {
      throw new Error(
        `Platform truth refresh failed for ${
          failures.length
        } connection(s): ${failures.join('; ')}`
      );
    }
    return {
      evaluated: integrations.length,
      ready,
      limited,
      invalid,
      unknown,
    };
  }
}
