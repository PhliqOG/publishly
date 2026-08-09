import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { WebhookEventLedgerService } from '@gitroom/nestjs-libraries/services/webhook.event.ledger.service';
import { stackUp, closeDb } from './helpers';

const d = stackUp() ? describe : describe.skip;

d('webhook event ledger (replay protection)', () => {
  let prisma: PrismaService;
  let ledger: WebhookEventLedgerService;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new WebhookEventLedgerService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeDb();
  });

  it('claims an event exactly once', async () => {
    const id = 'evt_it_' + Date.now();
    expect(await ledger.claimEvent('stripe', id, 'invoice.paid')).toBe(true);
    expect(await ledger.claimEvent('stripe', id, 'invoice.paid')).toBe(false);
  });

  it('parallel duplicate deliveries: only one wins', async () => {
    const id = 'evt_race_' + Date.now();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        ledger.claimEvent('stripe', id, 'sub.updated')
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('release makes the event claimable again (failed-handler retry)', async () => {
    const id = 'evt_retry_' + Date.now();
    expect(await ledger.claimEvent('stripe', id, 'sub.created')).toBe(true);
    await ledger.releaseEvent(id);
    expect(await ledger.claimEvent('stripe', id, 'sub.created')).toBe(true);
  });

  it('cleanup removes only old rows', async () => {
    const id = 'evt_old_' + Date.now();
    await ledger.claimEvent('stripe', id, 'x');
    const removed = await ledger.cleanup(30);
    expect(await ledger.claimEvent('stripe', id, 'x')).toBe(false);
    expect(removed).toBeGreaterThanOrEqual(0);
  });
});
