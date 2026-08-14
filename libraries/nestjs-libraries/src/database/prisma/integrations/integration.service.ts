import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { open as openSealed } from '@gitroom/helpers/auth/crypto.v2';
import { AnalyticsSnapshotRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics-snapshot.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration, Organization } from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import { PlatformTruthService } from '@gitroom/nestjs-libraries/database/prisma/platform-truth/platform-truth.service';
import { revokeProviderConnection } from '@gitroom/nestjs-libraries/integrations/provider.connection.revocation';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

dayjs.extend(utc);

@Injectable()
export class IntegrationService {
  private storage = UploadFactory.createStorage();
  private readonly logger = new Logger(IntegrationService.name);
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _analyticsSnapshotRepository: AnalyticsSnapshotRepository,
    private _platformTruth: PlatformTruthService
  ) {}

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (error) {
        this.logger.warn({
          event: 'autopost_workflow_termination_failed',
          organizationId: orgId,
          autopostId: item.id,
          code: 'autopost_termination_unavailable',
          reason: normalizePostFailure({ error }).reason,
        });
      }
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const uploadedPicture = picture
      ? picture?.indexOf('imagedelivery.net') > -1
        ? picture
        : await this.storage.uploadSimple(picture).catch((err) => {
            this.logger.warn({
              event: 'integration_profile_picture_copy_failed',
              organizationId: org,
              provider,
              code: 'profile_picture_copy_failed',
              reason: normalizePostFailure({ error: err }).reason,
            });
            return undefined;
          })
      : undefined;

    const integration =
      await this._integrationRepository.createOrUpdateIntegration(
        additionalSettings,
        oneTimeToken,
        org,
        name,
        uploadedPicture,
        type,
        internalId,
        provider,
        token,
        refreshToken,
        expiresIn,
        username,
        isBetweenSteps,
        refresh,
        timezone,
        customInstanceDetails
      );

    const providerImplementation =
      this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    if (providerImplementation.inspectPlatformTruth) {
      if (isBetweenSteps) {
        await this._platformTruth.recordSnapshot(integration, {
          state: 'UNKNOWN',
          publishingMode: 'UNKNOWN',
          auditState: 'NOT_APPLICABLE',
          code: `${integration.providerIdentifier}_page_selection_required`,
          reason:
            'Select and verify the matching platform account before Publishly can confirm publishing capability.',
          checkedAt: new Date(),
        });
      } else {
        await this._platformTruth.refreshIntegration(integration);
      }
      return (
        (await this._integrationRepository.getIntegrationById(
          org,
          integration.id
        )) || integration
      );
    }

    return integration;
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  getIntegrationsList(org: string) {
    return this._integrationRepository.getIntegrationsList(org);
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  async refreshToken(provider: SocialProvider, refresh: string) {
    try {
      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  async disconnectChannel(orgId: string, integration: Integration) {
    await this._integrationRepository.disconnectChannel(orgId, integration.id);
    await this.informAboutRefreshError(orgId, integration);
  }

  async informAboutRefreshError(
    orgId: string,
    integration: Integration,
    err = ''
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}`,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/launches`,
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const data = await this.refreshToken(provider, integration.refreshToken!);

      if (!data) {
        await this.informAboutRefreshError(
          integration.organizationId,
          integration
        );
        await this._integrationRepository.refreshNeeded(
          integration.organizationId,
          integration.id
        );
        return;
      }

      const { refreshToken, accessToken, expiresIn } = data;

      await this.createOrUpdateIntegration(
        undefined,
        !!provider.oneTimeToken,
        integration.organizationId,
        integration.name,
        undefined,
        'social',
        integration.internalId,
        integration.providerIdentifier,
        accessToken,
        refreshToken,
        expiresIn
      );
    }
  }

  async disableChannel(org: string, id: string) {
    return this._integrationRepository.disableChannel(org, id);
  }

  async enableChannel(org: string, totalChannels: number, id: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org)
    ).filter((f) => !f.disabled);
    if (
      !!process.env.STRIPE_PUBLISHABLE_KEY &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    return this._integrationRepository.enableChannel(org, id);
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    const integration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!integration || integration.deletedAt) return false;

    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (provider.revokeConnection) {
      try {
        await revokeProviderConnection(
          provider,
          openSealed(integration.token),
          integration.refreshToken
            ? openSealed(integration.refreshToken)
            : undefined
        );
      } catch (error) {
        const providerReason = error instanceof Error ? error.message : '';
        throw new HttpException(
          {
            code: 'provider_revocation_failed',
            reason:
              providerReason ||
              'The provider did not confirm authorization revocation. The connection was not reported as deleted; retry disconnect.',
            retryable: true,
          },
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
    }
    return this._integrationRepository.deleteChannel(org, id);
  }

  /**
   * Local-only purge for an authorization the provider has already revoked.
   * This intentionally skips a second remote revocation dependency.
   */
  purgeExternallyRevokedChannel(org: string, id: string) {
    return this._integrationRepository.deleteChannel(org, id);
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    const getIntegrationInformation = await provider.fetchPageInformation(
      openSealed(getIntegration.token),
      data
    );

    await this.checkForDeletedOnceAndUpdate(
      org,
      String(getIntegrationInformation.id)
    );
    const updated = await this._integrationRepository.updateIntegration(id, {
      picture: getIntegrationInformation.picture,
      internalId: String(getIntegrationInformation.id),
      organizationId: org,
      name: getIntegrationInformation.name,
      inBetweenSteps: false,
      token: getIntegrationInformation.access_token,
      profile: getIntegrationInformation.username,
    });

    try {
      await this._refreshIntegrationService.startRefreshWorkflow(
        updated,
        provider
      );
    } catch (error) {
      const schedulerError = error as {
        code?: string;
        failureClass?: string;
        message?: string;
        retryable?: boolean;
      };
      if (schedulerError?.code === 'token_refresh_scheduler_unavailable') {
        throw new HttpException(
          {
            failureClass: schedulerError.failureClass || 'recoverable',
            code: schedulerError.code,
            reason:
              schedulerError.message ||
              'Publishly could not start durable token monitoring.',
            retryable: schedulerError.retryable !== false,
          },
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      throw error;
    }

    const truth = getIntegrationInformation.platformTruth
      ? await this._platformTruth.recordSnapshot(
          updated,
          getIntegrationInformation.platformTruth
        )
      : (await this._platformTruth.refreshIntegration(updated)).response;

    return { success: true, platformTruth: truth };
  }

  async checkAnalytics(
    org: Organization,
    integration: string,
    date: string,
    forceRefresh = false
  ): Promise<AnalyticsData[]> {
    const getIntegration = await this.getIntegrationById(org.id, integration);

    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    if (getIntegration.type !== 'social') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this.disconnectChannel(org.id, getIntegration);
        return [];
      }
    }

    const getIntegrationData = await ioRedis.get(
      `integration:${org.id}:${integration}:${date}`
    );
    if (getIntegrationData) {
      return JSON.parse(getIntegrationData);
    }

    if (integrationProvider.analytics) {
      try {
        const loadAnalytics = await integrationProvider.analytics(
          getIntegration.internalId,
          openSealed(getIntegration.token),
          +date
        );
        await ioRedis.set(
          `integration:${org.id}:${integration}:${date}`,
          JSON.stringify(loadAnalytics),
          'EX',
          !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
            ? 1
            : 3600
        );
        // Persist today's platform-reported series for long-term history;
        // best-effort - analytics reads must not fail on snapshot writes.
        this._analyticsSnapshotRepository
          .saveSeries(org.id, getIntegration.id, loadAnalytics)
          .catch((error) => {
            this.logger.error({
              event: 'analytics_snapshot_write_failed',
              organizationId: org.id,
              integrationId: getIntegration.id,
              provider: getIntegration.providerIdentifier,
              code: 'analytics_snapshot_unavailable',
              reason: normalizePostFailure({ error }).reason,
            });
          });
        return loadAnalytics;
      } catch (error) {
        if (error instanceof RefreshToken) {
          return this.checkAnalytics(org, integration, date, true);
        }
        const failure = normalizePostFailure({ error, willRetry: true });
        this.logger.error({
          event: 'provider_analytics_failed',
          organizationId: org.id,
          integrationId: getIntegration.id,
          provider: getIntegration.providerIdentifier,
          failureClass: failure.failureClass,
          code: `${getIntegration.providerIdentifier}_analytics_unavailable`,
          reason: failure.reason,
          retryable: true,
        });
        throw new HttpException(
          {
            failureClass: failure.failureClass,
            code: `${getIntegration.providerIdentifier}_analytics_unavailable`,
            reason: failure.reason,
            retryable: true,
          },
          HttpStatus.BAD_GATEWAY
        );
      }
    }

    return [];
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration) {
      return;
    }

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    const getPlugById = await this._integrationRepository.getPlug(data.plugId);
    if (!getPlugById) {
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {})
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const { activated } = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    return {
      activated,
    };
  }

  async changePlugActivation(orgId: string, plugId: string, status: boolean) {
    const { id, integrationId, plugFunction } =
      await this._integrationRepository.changePlugActivation(
        orgId,
        plugId,
        status
      );

    return { id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }
}
