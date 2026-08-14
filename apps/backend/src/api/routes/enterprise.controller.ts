import {
  Body,
  Controller,
  HttpException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { safeOAuthReturnUrl } from '@gitroom/backend/services/auth/request.security';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import { serializeOAuthLoginState } from '@gitroom/nestjs-libraries/integrations/oauth.state';

@ApiTags('Enterprise')
@Controller('/enterprise')
export class EnterpriseController {
  constructor(
    private _integrationManager: IntegrationManager,
    private _organizationService: OrganizationService,
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

  @Post('/create-user')
  async createUser(@Body('params') params: string) {
    try {
      const { id, name, saasName, email } = AuthService.verifyJWT(params) as {
        id: string;
        name: string;
        email: string;
        saasName: string;
      };

      try {
        return await this._organizationService.createMaxUser(
          id,
          name,
          saasName,
          email
        );
      } catch (err) {
        return { create: false };
      }
    } catch (err) {
      return { success: false };
    }
  }

  @Post('/url')
  async redirectParams(@Body('params') params: string) {
    try {
      const load = AuthService.verifyJWT(params) as {
        redirectUrl: string;
        apiKey: string;
        refreshId?: string;
        provider: string;
        webhookUrl: string;
      };

      if (!load || !load.redirectUrl || !load.apiKey || !load.provider) {
        throw new Error(
          'OAuth request is missing redirectUrl, apiKey, or provider.'
        );
      }

      const org = await this._organizationService.getOrgByApiKey(load.apiKey);

      if (!org) {
        throw new Error('Organization not found');
      }

      if (
        !this._integrationManager
          .getAllowedSocialsIntegrations()
          .includes(load.provider)
      ) {
        throw new Error('Integration not allowed');
      }

      const integrationProvider = this._integrationManager.getSocialIntegration(
        load.provider
      );

      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl();

      if (load.refreshId) {
        await ioRedis.set(`refresh:${state}`, load.refreshId, 'EX', 3600);
      }

      const safeRedirectUrl = safeOAuthReturnUrl(load.redirectUrl, {
        allowExternalHttps: true,
      });
      if (!safeRedirectUrl) {
        throw new Error('Invalid OAuth return URL');
      }
      await ioRedis.set(`webhookUrl:${state}`, load.webhookUrl, 'EX', 3600);
      await ioRedis.set(`redirect:${state}`, safeRedirectUrl, 'EX', 3600);
      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(
        `login:${state}`,
        serializeOAuthLoginState(load.provider, codeVerifier),
        'EX',
        3600
      );

      return url;
    } catch (error) {
      const failure = normalizePostFailure({ error, willRetry: true });
      const response = {
        failureClass: failure.failureClass,
        code: 'oauth_start_failed',
        reason: failure.reason,
        retryable: failure.failureClass === 'recoverable',
      };
      console.error({
        event: 'enterprise_oauth_start_failed',
        ...response,
      });
      throw new HttpException(response, response.retryable ? 503 : 400);
    }
  }

  @Post('/delete-channel')
  async deleteChannel(@Body('params') params: string) {
    try {
      const load = AuthService.verifyJWT(params) as {
        apiKey: string;
        id: string;
      };

      if (!load || !load.apiKey || !load.id) {
        return { success: false };
      }

      const org = await this._organizationService.getOrgByApiKey(load.apiKey);

      if (!org) {
        return { success: false };
      }

      const isTherePosts = await this._integrationService.getPostsForChannel(
        org.id,
        load.id
      );
      await this._integrationService.deleteChannel(org.id, load.id);
      const cleanup = await Promise.allSettled(
        isTherePosts.map((post) =>
          this._postsService.deletePost(org.id, post.group)
        )
      );
      const cleanupFailures = cleanup.filter(
        (result) => result.status === 'rejected'
      ).length;
      return {
        success: true,
        warnings: cleanupFailures
          ? [
              {
                code: 'scheduled_post_cleanup_failed',
                reason: `${cleanupFailures} scheduled post group(s) could not be removed immediately. The deleted connection cannot publish them.`,
              },
            ]
          : [],
      };
    } catch (err) {
      return {
        success: false,
        code: 'integration_deletion_failed',
        reason:
          err instanceof Error && err.message
            ? err.message
            : 'The integration could not be deleted. Retry the request.',
      };
    }
  }
}
