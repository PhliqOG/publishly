import { readFileSync } from 'fs';
import { join } from 'path';

describe('postWorkflowV109 account-queue integration', () => {
  const current = readFileSync(
    join(__dirname, 'post.workflow.v1.0.9.ts'),
    'utf8'
  );
  const legacy = readFileSync(
    join(__dirname, 'post.workflow.v1.0.8.ts'),
    'utf8'
  );

  it('acquires the destination lease before the primary provider mutation', () => {
    const acquire = current.indexOf(
      'accountQueueLeaseToken = await acquireAccountQueue()'
    );
    const mutate = current.indexOf('await postSocialPending');
    expect(acquire).toBeGreaterThan(0);
    expect(mutate).toBeGreaterThan(acquire);
  });

  it('releases on provider acceptance and routes every failure through tested policy', () => {
    expect(current).toContain("'COMPLETED',\n            'provider_accepted'");
    expect(current).toContain('accountQueueFailureDisposition({');
    expect(current).toContain('disposition.markUnconfirmed');
    expect(current).toContain('disposition.shouldRetry');
  });

  it('leaves V108 histories free of new activity commands', () => {
    expect(legacy).not.toContain('acquireAccountPublishingQueueV109');
    expect(legacy).not.toContain('releaseAccountPublishingQueueV109');
  });

  it('gates campaign dispatch before the account queue and records a mutation attempt', () => {
    const gate = current.indexOf('await waitForBulkCampaignGate()');
    const queue = current.indexOf('await waitForConnectionRateLimit()');
    const attempt = current.indexOf('await postSocialPendingV109(');
    expect(gate).toBeGreaterThan(0);
    expect(queue).toBeGreaterThan(gate);
    expect(attempt).toBeGreaterThan(queue);
    expect(current).toContain("patched('v109-durable-attempt-readback-v1')");
  });

  it('reads provider state before retrying every ambiguous mutation', () => {
    const ambiguous = current.indexOf('disposition.markUnconfirmed &&');
    const readback = current.indexOf('await reconcileAmbiguousPostV109(', ambiguous);
    const absent = current.indexOf("readback.status === 'absent'", readback);
    const retry = current.indexOf('await waitForRecoverableRetry(err, attempt, true)', absent);
    const inconclusive = current.indexOf("'provider_readback_inconclusive'", readback);
    expect(ambiguous).toBeGreaterThan(0);
    expect(readback).toBeGreaterThan(ambiguous);
    expect(absent).toBeGreaterThan(readback);
    expect(retry).toBeGreaterThan(absent);
    expect(inconclusive).toBeGreaterThan(readback);
  });
});
