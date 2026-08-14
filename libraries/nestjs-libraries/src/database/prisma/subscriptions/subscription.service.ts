import { Injectable } from '@nestjs/common';
import {
  PAID_BILLING_TIERS,
  PaidBillingTier,
  pricingForTier,
  resolveBillingTier,
  StoredBillingTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SubscriptionRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { Organization } from '@prisma/client';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { successfulPostUsageProjection } from '@gitroom/nestjs-libraries/reliability/billing.usage';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly _subscriptionRepository: SubscriptionRepository,
    private readonly _integrationService: IntegrationService,
    private readonly _organizationService: OrganizationService
  ) {}

  getSubscriptionByOrganizationId(organizationId: string) {
    return this._subscriptionRepository.getSubscriptionByOrganizationId(
      organizationId
    );
  }

  useCredit<T>(
    organization: Organization,
    type = 'ai_images',
    func: () => Promise<T>
  ): Promise<T> {
    return this._subscriptionRepository.useCredit(organization, type, func);
  }

  getCode(code: string) {
    return this._subscriptionRepository.getCode(code);
  }

  async deleteSubscription(customerId: string) {
    await this.modifySubscription(customerId, 'FREE');
    return this._subscriptionRepository.deleteSubscriptionByCustomerId(
      customerId
    );
  }

  updateCustomerId(organizationId: string, customerId: string) {
    return this._subscriptionRepository.updateCustomerId(
      organizationId,
      customerId
    );
  }

  async checkSubscription(organizationId: string, subscriptionId: string) {
    return await this._subscriptionRepository.checkSubscription(
      organizationId,
      subscriptionId
    );
  }

  async modifySubscriptionByOrg(
    organizationId: string,
    billing: StoredBillingTier
  ) {
    if (!organizationId) {
      return false;
    }

    const getCurrentSubscription =
      (await this._subscriptionRepository.getSubscriptionByOrgId(
        organizationId
      ))!;

    const normalizedBilling = resolveBillingTier(billing);
    const from = pricingForTier(getCurrentSubscription?.subscriptionTier);
    const to = pricingForTier(normalizedBilling);
    const totalChannels = to.channel || 0;

    const currentTotalChannels = (
      await this._integrationService.getIntegrationsList(organizationId)
    ).filter((f) => !f.disabled);

    if (currentTotalChannels.length > totalChannels) {
      await this._integrationService.disableIntegrations(
        organizationId,
        currentTotalChannels.length - totalChannels
      );
    }

    if (from.team_members && !to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        organizationId,
        true
      );
    }

    if (!from.team_members && to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        organizationId,
        false
      );
    }

    if (normalizedBilling === 'FREE') {
      await this._integrationService.changeActiveCron(organizationId);
    }

    return true;
  }

  async modifySubscription(customerId: string, billing: StoredBillingTier) {
    if (!customerId) {
      return false;
    }

    const getOrgByCustomerId =
      await this._subscriptionRepository.getOrganizationByCustomerId(
        customerId
      );

    const getCurrentSubscription =
      (await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      ))!;

    if (
      !getOrgByCustomerId ||
      (getCurrentSubscription && getCurrentSubscription?.isLifetime)
    ) {
      return false;
    }

    const normalizedBilling = resolveBillingTier(billing);
    const from = pricingForTier(getCurrentSubscription?.subscriptionTier);
    const to = pricingForTier(normalizedBilling);
    const totalChannels = to.channel || 0;

    const currentTotalChannels = (
      await this._integrationService.getIntegrationsList(
        getOrgByCustomerId?.id!
      )
    ).filter((f) => !f.disabled);

    if (currentTotalChannels.length > totalChannels) {
      await this._integrationService.disableIntegrations(
        getOrgByCustomerId?.id!,
        currentTotalChannels.length - totalChannels
      );
    }

    if (from.team_members && !to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        getOrgByCustomerId?.id!,
        true
      );
    }

    if (!from.team_members && to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        getOrgByCustomerId?.id!,
        false
      );
    }

    if (normalizedBilling === 'FREE') {
      await this._integrationService.changeActiveCron(getOrgByCustomerId?.id!);
    }

    return true;
  }

  async createOrUpdateSubscription(
    isTrailing: boolean,
    identifier: string,
    customerId: string,
    billing: PaidBillingTier | 'ULTIMATE',
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null,
    code?: string,
    org?: string
  ) {
    const normalizedBilling = resolveBillingTier(billing);
    if (
      !(PAID_BILLING_TIERS as readonly string[]).includes(normalizedBilling)
    ) {
      throw new Error(
        `A paid subscription cannot use tier ${normalizedBilling}`
      );
    }
    const paidBilling = normalizedBilling as PaidBillingTier;
    const totalChannels = pricingForTier(paidBilling).channel || 0;
    if (!code) {
      const load = await this.modifySubscription(customerId, paidBilling);
      if (!load) {
        throw new Error(
          `Subscription ${identifier} could not resolve an eligible customer organization.`
        );
      }
    }
    return this._subscriptionRepository.createOrUpdateSubscription(
      isTrailing,
      identifier,
      customerId,
      totalChannels,
      paidBilling,
      period,
      cancelAt,
      code,
      org ? { id: org } : undefined
    );
  }

  getSubscriptionByIdentifier(identifier: string) {
    return this._subscriptionRepository.getSubscriptionByIdentifier(identifier);
  }

  async getSubscription(organizationId: string) {
    return this._subscriptionRepository.getSubscription(organizationId);
  }

  async getSuccessfulPostUsage(
    organizationId: string,
    organizationCreatedAt: Date,
    now = new Date()
  ) {
    const subscription =
      await this._subscriptionRepository.getSubscriptionByOrganizationId(
        organizationId
      );
    const tier = resolveBillingTier(subscription?.subscriptionTier);
    const anchor = subscription?.createdAt || organizationCreatedAt;
    const empty = successfulPostUsageProjection({
      tier,
      anchor,
      used: 0,
      now,
    });
    const used = await this._subscriptionRepository.countSuccessfulPostUsage(
      organizationId,
      empty.periodStart,
      empty.periodEnd
    );
    return successfulPostUsageProjection({ tier, anchor, used, now });
  }

  async checkCredits(organization: Organization, checkType = 'ai_images') {
    // @ts-ignore
    const type = organization?.subscription?.subscriptionTier || 'FREE';

    if (type === 'FREE') {
      return { credits: 0 };
    }

    // @ts-ignore
    let date = dayjs(organization.subscription.createdAt);
    while (date.isBefore(dayjs())) {
      date = date.add(1, 'month');
    }

    const checkFromMonth = date.subtract(1, 'month');
    const plan = pricingForTier(type);
    const imageGenerationCount =
      checkType === 'ai_images'
        ? plan.image_generation_count
        : plan.generate_videos;

    const totalUse = await this._subscriptionRepository.getCreditsFrom(
      organization.id,
      checkFromMonth,
      checkType
    );

    return {
      credits: imageGenerationCount - totalUse,
    };
  }

  async addSubscription(orgId: string, userId: string, subscription: any) {
    const tier = resolveBillingTier(subscription);
    if (!(PAID_BILLING_TIERS as readonly string[]).includes(tier)) {
      throw new Error(`Cannot grant non-paid subscription tier ${tier}`);
    }
    await this._subscriptionRepository.setCustomerId(orgId, userId);
    return this.createOrUpdateSubscription(
      false,
      makeId(5),
      userId,
      tier as PaidBillingTier,
      'MONTHLY',
      null,
      undefined,
      orgId
    );
  }
}
