import { Injectable } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { withOpenToken } from '@gitroom/helpers/auth/crypto.v2';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { PublishingReceiptService } from './publishing-receipt.service';

type ConfirmationPost = {
  id: string;
  organizationId: string;
  integration: Integration;
};

@Injectable()
export class PostConfirmationService {
  constructor(
    private _integrationManager: IntegrationManager,
    private _receipts: PublishingReceiptService
  ) {}

  async ensureConfirmed(
    post: ConfirmationPost,
    providerPostId: string,
    providerUrl: string
  ) {
    const existing = await this._receipts.isConfirmed(
      post.organizationId,
      post.id,
      providerPostId
    );
    if (existing) return existing;

    const provider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );
    const openedIntegration = withOpenToken(post.integration);
    const confirmation = await provider.confirmPost(
      openedIntegration.token,
      providerPostId,
      providerUrl,
      openedIntegration
    );
    if (confirmation.status !== 'confirmed') {
      throw new BadBody(
        provider.identifier,
        JSON.stringify({
          status: confirmation.status,
          method: confirmation.method,
          evidence: confirmation.evidence,
        }),
        '{}',
        confirmation.reason,
        {
          code:
            confirmation.status === 'unsupported'
              ? 'provider_configuration_required'
              : 'status_check_failed',
          mutationMayHaveSucceeded: true,
        }
      );
    }

    return this._receipts.record({
      organizationId: post.organizationId,
      postId: post.id,
      stage: 'confirmed_live',
      providerPostId: confirmation.providerPostId || providerPostId,
      providerUrl: confirmation.providerUrl || providerUrl,
      confirmationMethod: confirmation.method,
      evidence: confirmation.evidence,
    });
  }
}
