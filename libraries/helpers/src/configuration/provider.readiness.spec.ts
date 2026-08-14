import path from 'node:path';
import {
  EXPECTED_PROVIDER_IDS,
  manifest,
  validateProviderReadiness,
} from '../../../../scripts/verify-provider-readiness.cjs';

describe('provider approval readiness contract', () => {
  const repositoryRoot = path.resolve(__dirname, '../../../..');

  it('keeps the ten website networks aligned with review-critical source', () => {
    expect(validateProviderReadiness(repositoryRoot)).toEqual([]);
  });

  it('gives every provider a review path, purpose, evidence, and official source', () => {
    expect((manifest as any).providers.map(({ id }: any) => id)).toEqual(
      EXPECTED_PROVIDER_IDS
    );
    for (const provider of (manifest as any).providers) {
      expect(provider.reviewPath).toEqual(expect.any(String));
      expect(provider.permissionPurpose).toEqual(expect.any(String));
      expect(provider.reviewEvidence).toEqual(expect.any(String));
      expect(provider.officialDocs.length).toBeGreaterThan(0);
    }
  });
});
