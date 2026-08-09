import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Replay protection for incoming webhooks (Stripe first). Providers redeliver
// events on timeouts and retries; processing a billing event twice must never
// happen. claimEvent inserts the event id - the unique constraint makes the
// second delivery lose the race atomically. If processing then fails, the
// caller releases the claim so the provider's redelivery can retry it.
@Injectable()
export class WebhookEventLedgerService {
  constructor(private _prisma: PrismaService) {}

  async claimEvent(source: string, id: string, type: string): Promise<boolean> {
    try {
      await this._prisma.processedWebhookEvent.create({
        data: { id, source, type },
      });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return false;
      }
      throw err;
    }
  }

  async releaseEvent(id: string): Promise<void> {
    await this._prisma.processedWebhookEvent.deleteMany({ where: { id } });
  }

  // Ledger rows only need to outlive the provider's redelivery window
  // (Stripe retries for up to ~3 days); 30 days is comfortable.
  async cleanup(olderThanDays = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const { count } = await this._prisma.processedWebhookEvent.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    return count;
  }
}
