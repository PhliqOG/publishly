import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMetaWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | string[] | undefined,
  secrets: Array<string | undefined>
): boolean {
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature || '');
  if (!rawBody || !match) return false;

  const supplied = Buffer.from(match[1], 'hex');
  return secrets
    .filter((secret): secret is string => !!secret?.trim())
    .some((secret) => {
      const expected = createHmac('sha256', secret).update(rawBody).digest();
      return (
        supplied.length === expected.length &&
        timingSafeEqual(supplied, expected)
      );
    });
}
