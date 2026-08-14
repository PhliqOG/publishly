import {
  confirmCurrentConnect,
  createConnectBatch,
  currentConnectAction,
  failCurrentConnect,
  parseConnectBatch,
} from './fleet-connect.flow';

const action = (provider: string, ordinal: number) => ({
  actionId: `${provider}:${ordinal}`,
  provider,
  providerName: provider === 'facebook' ? 'Facebook' : provider,
  ordinal,
});

describe('fleet bulk-connect flow', () => {
  it('preserves server order in a resumable metadata-only batch', () => {
    const batch = createConnectBatch({
      actions: [action('facebook', 1), action('facebook', 2)],
      rejected: [
        {
          provider: 'mastodon',
          count: 1,
          code: 'external_details_required',
          reason: 'Connect this provider individually.',
        },
      ],
    });

    expect(currentConnectAction(batch)).toEqual(action('facebook', 1));
    expect(parseConnectBatch(JSON.stringify(batch))).toEqual(batch);
  });

  it('advances only when the OAuth callback confirms the expected provider', () => {
    const batch = createConnectBatch({
      actions: [action('facebook', 1), action('facebook', 2)],
      rejected: [],
    });
    expect(confirmCurrentConnect(batch, 'x')).toBe(batch);
    const confirmed = confirmCurrentConnect(batch, 'facebook');
    expect(confirmed).toMatchObject({
      cursor: 1,
      completed: ['facebook:1'],
    });
    expect(currentConnectAction(confirmed)).toEqual(action('facebook', 2));
  });

  it('records a non-empty classified launch failure without claiming success', () => {
    const batch = createConnectBatch({
      actions: [action('facebook', 1)],
      rejected: [],
    });
    expect(
      failCurrentConnect(batch, 'OAuth URL was unavailable')
    ).toMatchObject({
      cursor: 1,
      completed: [],
      failed: [
        {
          actionId: 'facebook:1',
          reason: 'OAuth URL was unavailable',
        },
      ],
    });
  });

  it('rejects corrupt or credential-shaped persisted state', () => {
    expect(parseConnectBatch('{bad json')).toBeNull();
    const batch = createConnectBatch({
      actions: [action('facebook', 1)],
      rejected: [],
    });
    expect(
      parseConnectBatch(
        JSON.stringify({
          ...batch,
          actions: [{ ...batch.actions[0], accessToken: 'secret' }],
        })
      )
    ).toBeNull();
  });
});
