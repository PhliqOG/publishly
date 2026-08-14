import { createHmac } from 'node:crypto';
import { verifyMetaWebhookSignature } from './meta-webhook.verifier';

describe('Meta webhook signature verification', () => {
  const body = Buffer.from(JSON.stringify({ object: 'instagram', entry: [] }));
  const signature = `sha256=${createHmac('sha256', 'app-secret')
    .update(body)
    .digest('hex')}`;

  it('accepts a signature produced by either configured Meta app', () => {
    expect(
      verifyMetaWebhookSignature(body, signature, [
        'different-secret',
        'app-secret',
      ])
    ).toBe(true);
  });

  it('rejects altered bodies and malformed headers', () => {
    expect(
      verifyMetaWebhookSignature(Buffer.from('altered'), signature, [
        'app-secret',
      ])
    ).toBe(false);
    expect(
      verifyMetaWebhookSignature(body, 'sha1=invalid', ['app-secret'])
    ).toBe(false);
  });
});
