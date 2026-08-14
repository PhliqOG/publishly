import {
  isDefinitiveProviderRevocation,
  ProviderConnectionRevocationError,
  revokeProviderConnection,
} from './provider.connection.revocation';

describe('provider connection revocation boundary', () => {
  it('passes decrypted access and refresh credentials to the provider', async () => {
    const revokeConnection = jest.fn().mockResolvedValue(undefined);
    await expect(
      revokeProviderConnection(
        { revokeConnection } as any,
        'access-token',
        'refresh-token'
      )
    ).resolves.toBeUndefined();
    expect(revokeConnection).toHaveBeenCalledWith(
      'access-token',
      'refresh-token'
    );
  });

  it('does nothing for providers without remote revocation', async () => {
    await expect(
      revokeProviderConnection({} as any, 'access-token')
    ).resolves.toBeUndefined();
  });

  it('converts an empty non-Error rejection into a classified visible failure', async () => {
    await expect(
      revokeProviderConnection(
        { revokeConnection: jest.fn().mockRejectedValue(null) } as any,
        'access-token'
      )
    ).rejects.toMatchObject({
      name: 'ProviderConnectionRevocationError',
      code: 'provider_revocation_failed',
      retryable: true,
      message: expect.stringContaining('did not confirm'),
    });
  });

  it('preserves a provider reason without exposing a false deletion', async () => {
    await expect(
      revokeProviderConnection(
        {
          revokeConnection: jest
            .fn()
            .mockRejectedValue(new Error('Google unavailable')),
        } as any,
        'access-token'
      )
    ).rejects.toBeInstanceOf(ProviderConnectionRevocationError);
  });

  it('recognizes a Google invalid_grant refresh response as definitive YouTube revocation', () => {
    expect(
      isDefinitiveProviderRevocation('youtube', {
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          },
        },
      })
    ).toBe(true);
  });

  it('does not erase on a transient Google transport or server failure', () => {
    expect(
      isDefinitiveProviderRevocation(
        'youtube',
        new Error('Google token endpoint temporarily unavailable (HTTP 503)')
      )
    ).toBe(false);
  });

  it('never applies YouTube revocation semantics to another provider', () => {
    expect(
      isDefinitiveProviderRevocation(
        'linkedin',
        new Error('invalid_grant: token was revoked')
      )
    ).toBe(false);
  });
});
