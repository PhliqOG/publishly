import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { open as openSealed } from '@gitroom/helpers/auth/crypto.v2';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { TemporalService } from 'nestjs-temporal-core';
import { ConnectionHealthService } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import { isDefinitiveProviderRevocation } from '@gitroom/nestjs-libraries/integrations/provider.connection.revocation';

export class TokenRefreshWorkflowStartError extends Error {
  readonly failureClass = 'recoverable';
  readonly code = 'token_refresh_scheduler_unavailable';
  readonly retryable = true;

  constructor(reason: string) {
    super(reason);
    this.name = 'TokenRefreshWorkflowStartError';
  }
}

@Injectable()
export class RefreshIntegrationService {
  private readonly logger = new Logger(RefreshIntegrationService.name);

  constructor(
    private _integrationManager: IntegrationManager,
    @Inject(forwardRef(() => IntegrationService))
    private _integrationService: IntegrationService,
    private _temporalService: TemporalService,
    private _connectionHealth: ConnectionHealthService
  ) {}
  async refresh(
    integration: Integration,
    cause = ''
  ): Promise<false | AuthTokenDetails> {
    const socialProvider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const refresh = await this.refreshProcess(
      integration,
      socialProvider,
      cause
    );

    if (!refresh) {
      return false as const;
    }

    await this._integrationService.createOrUpdateIntegration(
      undefined,
      !!socialProvider.oneTimeToken,
      integration.organizationId,
      integration.name,
      integration.picture!,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      refresh.accessToken,
      refresh.refreshToken,
      refresh.expiresIn
    );

    await this._connectionHealth.recordTokenRefreshed(integration);

    return refresh;
  }

  public async setBetweenSteps(integration: Integration, cause = '') {
    await this._integrationService.setBetweenRefreshSteps(integration.id);
    await this._integrationService.informAboutRefreshError(
      integration.organizationId,
      integration,
      cause
    );
  }

  public async startRefreshWorkflow(
    connection: Integration,
    integration: SocialProvider
  ) {
    if (!integration.refreshCron) {
      return false;
    }

    try {
      const workflow = await this._temporalService.client
        .getRawClient()
        ?.workflow.start(`refreshTokenWorkflow`, {
          workflowId: `refresh_${connection.id}`,
          args: [
            {
              integrationId: connection.id,
              organizationId: connection.organizationId,
            },
          ],
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        });
      if (!workflow) {
        throw new Error('Temporal returned no workflow handle.');
      }
      return workflow;
    } catch (error) {
      const providerReason = normalizePostFailure({ error }).reason;
      const failure = new TokenRefreshWorkflowStartError(
        `Publishly could not start durable ${connection.providerIdentifier} token monitoring: ${providerReason}`
      );
      this.logger.error({
        event: 'token_refresh_workflow_start_failed',
        organizationId: connection.organizationId,
        integrationId: connection.id,
        provider: connection.providerIdentifier,
        failureClass: failure.failureClass,
        code: failure.code,
        reason: failure.message,
        retryable: failure.retryable,
      });
      await this._connectionHealth.recordTokenInvalidation(
        connection,
        failure.message
      );
      await this._integrationService.informAboutRefreshError(
        connection.organizationId,
        connection,
        failure.message
      );
      throw failure;
    }
  }

  private async refreshProcess(
    integration: Integration,
    socialProvider: SocialProvider,
    cause = ''
  ): Promise<AuthTokenDetails | false> {
    let refresh: false | AuthTokenDetails = false;
    let refreshError: unknown;
    try {
      refresh = await socialProvider.refreshToken(
        openSealed(integration.refreshToken)
      );
    } catch (error) {
      refreshError = error;
    }

    if (!refresh || !refresh.accessToken) {
      return this.recordRefreshFailure(
        integration,
        refreshError ||
          new Error(
            cause ||
              `${integration.providerIdentifier} returned no usable refreshed access token.`
          )
      );
    }

    if (
      !socialProvider.reConnect ||
      integration.rootInternalId === integration.internalId
    ) {
      return refresh;
    }

    let reConnect: Awaited<
      ReturnType<NonNullable<SocialProvider['reConnect']>>
    >;
    try {
      reConnect = await socialProvider.reConnect(
        integration.rootInternalId,
        integration.internalId,
        refresh.accessToken
      );
    } catch (error) {
      return this.recordRefreshFailure(integration, error);
    }

    return {
      ...refresh,
      ...reConnect,
    };
  }

  private async recordRefreshFailure(
    integration: Integration,
    error: unknown
  ): Promise<false> {
    const definitiveRevocation = isDefinitiveProviderRevocation(
      integration.providerIdentifier,
      error
    );
    const failure = normalizePostFailure({
      error,
      code: 'reconnect_required',
      willRetry: false,
    });
    await this._connectionHealth.recordTokenInvalidation(
      integration,
      failure.reason
    );
    await this._integrationService.refreshNeeded(
      integration.organizationId,
      integration.id
    );
    await this._integrationService.informAboutRefreshError(
      integration.organizationId,
      integration,
      failure.reason
    );
    if (definitiveRevocation) {
      await this._integrationService.purgeExternallyRevokedChannel(
        integration.organizationId,
        integration.id
      );
    }
    return false;
  }
}
