import {
  Controller,
  HttpException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { WebhookEventLedgerService } from '@gitroom/nestjs-libraries/services/webhook.event.ledger.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Stripe')
@Controller('/stripe')
export class StripeController {
  constructor(
    private readonly _stripeService: StripeService,
    private readonly _webhookLedger: WebhookEventLedgerService
  ) {}

  @Post('/')
  async stripe(@Req() req: RawBodyRequest<Request>) {
    const event = this._stripeService.validateRequest(
      req.rawBody,
      // @ts-ignore
      req.headers['stripe-signature'],
      process.env.STRIPE_SIGNING_KEY
    );

    // Maybe it comes from another stripe webhook
    if (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      event?.data?.object?.metadata?.service !== 'gitroom' &&
      event.type !== 'invoice.payment_succeeded'
    ) {
      return { ok: true };
    }

    // Stripe redelivers on timeout/retry; each event id gets processed once.
    const claimed = await this._webhookLedger.claimEvent(
      'stripe',
      event.id,
      event.type
    );
    if (!claimed) {
      return { ok: true, duplicate: true };
    }

    try {
      switch (event.type) {
        case 'invoice.payment_succeeded':
          return await this._stripeService.paymentSucceeded(event);
        case 'customer.subscription.created':
          return await this._stripeService.createSubscription(event);
        case 'customer.subscription.updated':
          return await this._stripeService.updateSubscription(event);
        case 'customer.subscription.deleted':
          return await this._stripeService.deleteSubscription(event);
        default:
          return { ok: true };
      }
    } catch (e) {
      // Release the claim so Stripe's redelivery can retry a failed handler -
      // dedupe applies to successfully processed events only.
      await this._webhookLedger.releaseEvent(event.id);
      throw new HttpException(e, 500);
    }
  }
}
