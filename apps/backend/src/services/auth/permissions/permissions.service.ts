import { Ability, AbilityBuilder, AbilityClass } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import {
  pricingForTier,
  resolveBillingTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { AuthorizationActions, Sections } from './permission.exception.class';

export type AppAbility = Ability<[AuthorizationActions, Sections]>;

@Injectable()
export class PermissionsService {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _integrationService: IntegrationService,
    private _webhooksService: WebhooksService
  ) {}
  async getPackageOptions(orgId: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(orgId);

    const tier = resolveBillingTier(
      subscription?.subscriptionTier ||
        (!process.env.STRIPE_PUBLISHABLE_KEY ? 'PRO' : 'FREE')
    );

    const options = pricingForTier(tier);
    return {
      subscription,
      options,
    };
  }

  async check(
    orgId: string,
    created_at: Date,
    permission: 'USER' | 'ADMIN' | 'SUPERADMIN',
    requestedPermission: Array<[AuthorizationActions, Sections]>,
    refreshChannelId?: string
  ) {
    const { can, build } = new AbilityBuilder<
      Ability<[AuthorizationActions, Sections]>
    >(Ability as AbilityClass<AppAbility>);

    if (requestedPermission.length === 0) {
      return build({
        detectSubjectType: (item) =>
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          item.constructor,
      });
    }

    const billingDisabled = !process.env.STRIPE_PUBLISHABLE_KEY;
    const packageOptions = billingDisabled
      ? null
      : await this.getPackageOptions(orgId);
    const subscription = packageOptions?.subscription;
    const options = packageOptions?.options;
    for (const [action, section] of requestedPermission) {
      // Workspace roles are authorization, not an entitlement. They must be
      // enforced even in self-hosted/development deployments without Stripe.
      if (section === Sections.ADMIN) {
        if (['ADMIN', 'SUPERADMIN'].includes(permission)) {
          can(action, section);
        }
        continue;
      }

      if (section === Sections.OWNER) {
        if (permission === 'SUPERADMIN') {
          can(action, section);
        }
        continue;
      }

      // With billing disabled, all product entitlements are available, while
      // the role gate above remains active.
      if (billingDisabled) {
        can(action, section);
        continue;
      }

      // check for the amount of channels
      if (section === Sections.CHANNEL) {
        // Refreshing an existing channel doesn't add a new one, so skip the limit check
        // but only if the channel actually belongs to this org
        if (refreshChannelId) {
          const existingIntegration =
            await this._integrationService.getIntegrationById(
              orgId,
              refreshChannelId
            );
          if (existingIntegration) {
            can(action, section);
            continue;
          }
        }

        const totalChannels = (
          await this._integrationService.getIntegrationsList(orgId)
        ).filter((f) => !f.refreshNeeded).length;

        if (options!.channel && options!.channel > totalChannels) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.WEBHOOKS) {
        const totalWebhooks = await this._webhooksService.getTotal(orgId);
        if (totalWebhooks < options!.webhooks) {
          can(AuthorizationActions.Create, section);
          continue;
        }
      }

      // check for posts per month
      if (section === Sections.POSTS_PER_MONTH) {
        const usage = await this._subscriptionService.getSuccessfulPostUsage(
          orgId,
          created_at
        );

        if (!usage.exhausted) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.TEAM_MEMBERS && options!.team_members) {
        can(action, section);
        continue;
      }

      if (
        section === Sections.COMMUNITY_FEATURES &&
        options!.community_features
      ) {
        can(action, section);
        continue;
      }

      if (
        section === Sections.FEATURED_BY_GITROOM &&
        options!.featured_by_gitroom
      ) {
        can(action, section);
        continue;
      }

      if (section === Sections.AI && options!.ai) {
        can(action, section);
        continue;
      }

      if (section === Sections.PUBLIC_API && options!.public_api) {
        can(action, section);
        continue;
      }

      if (section === Sections.BULK_TOOLS && options!.bulk_tools) {
        can(action, section);
        continue;
      }

      if (
        section === Sections.IMPORT_FROM_CHANNELS &&
        options!.import_from_channels
      ) {
        can(action, section);
      }
    }

    return build({
      detectSubjectType: (item) =>
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        item.constructor,
    });
  }
}
