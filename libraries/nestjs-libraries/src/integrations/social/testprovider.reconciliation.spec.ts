import {
  resetTestProviderState,
  TestProviderProvider,
  testProviderCalls,
} from './testprovider.provider';

describe('TestProvider ambiguous acceptance readback', () => {
  const provider = new TestProviderProvider();

  beforeEach(() => {
    resetTestProviderState();
    delete process.env.TEST_PROVIDER_FAIL_TIMES;
    delete process.env.TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES;
  });

  it('proves accepted-then-timeout from provider state without a second mutation', async () => {
    process.env.TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES = '1';
    await expect(
      provider.post(
        'account-1',
        'token',
        [{ id: 'post-1', message: 'hello', settings: {}, media: [] }],
        { id: 'integration-1' } as any
      )
    ).rejects.toThrow(/ambiguous failure after side effect/);
    expect(testProviderCalls.filter((event) => event.event === 'post')).toHaveLength(1);
    const result = await provider.reconcileAmbiguousPost(
      'token',
      {
        publishlyPostId: 'post-1',
        mutationFingerprint: 'a'.repeat(64),
        mutationStartedAt: '2026-08-13T00:00:00.000Z',
      },
      { id: 'integration-1' } as any
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        providerPostId: 'tp_post-1',
      })
    );
    expect(testProviderCalls.filter((event) => event.event === 'post')).toHaveLength(1);
  });

  it('returns absent only when its side-effect ledger proves no matching post', async () => {
    const result = await provider.reconcileAmbiguousPost(
      'token',
      {
        publishlyPostId: 'post-missing',
        mutationFingerprint: 'b'.repeat(64),
        mutationStartedAt: '2026-08-13T00:00:00.000Z',
      },
      { id: 'integration-1' } as any
    );
    expect(result).toEqual(
      expect.objectContaining({ status: 'absent', method: 'test_provider_side_effect_read' })
    );
  });
});
