import {
  completeCurrentReconnect,
  createReconnectBatch,
  currentReconnectAction,
  failCurrentReconnect,
  parseReconnectBatch,
} from './fleet-reconnect.flow';

const action = (id: string) => ({
  integrationId: id,
  internalId: `provider-${id}`,
  name: `Account ${id}`,
  provider: 'facebook',
});

describe('fleet reconnect flow', () => {
  it('preserves server order and safe rejections in a resumable batch', () => {
    const batch = createReconnectBatch({
      actions: [action('one'), action('two')],
      rejected: [
        {
          integrationId: 'three',
          code: 'connection_disabled',
          reason: 'Enable this connection first.',
        },
      ],
    });

    expect(currentReconnectAction(batch)).toMatchObject({
      integrationId: 'one',
    });
    expect(parseReconnectBatch(JSON.stringify(batch))).toEqual(batch);
  });

  it('advances only after callback confirmation and records each completed ID', () => {
    const batch = createReconnectBatch({
      actions: [action('one'), action('two')],
      rejected: [],
    });
    const afterOne = completeCurrentReconnect(batch);
    expect(afterOne).toMatchObject({ cursor: 1, completed: ['one'] });
    expect(currentReconnectAction(afterOne)).toMatchObject({
      integrationId: 'two',
    });
    const done = completeCurrentReconnect(afterOne);
    expect(done).toMatchObject({ cursor: 2, completed: ['one', 'two'] });
    expect(currentReconnectAction(done)).toBeNull();
  });

  it('records a non-empty launch failure and continues without claiming success', () => {
    const batch = createReconnectBatch({
      actions: [action('one'), action('two')],
      rejected: [],
    });
    const failed = failCurrentReconnect(batch, 'OAuth URL unavailable');
    expect(failed).toMatchObject({
      cursor: 1,
      completed: [],
      failed: [{ integrationId: 'one', reason: 'OAuth URL unavailable' }],
    });
  });

  it('rejects corrupt or credential-shaped local state instead of resuming it', () => {
    expect(parseReconnectBatch('{bad json')).toBeNull();
    expect(
      parseReconnectBatch(
        JSON.stringify({
          version: 1,
          actions: [{ integrationId: 'one', token: 'secret' }],
          rejected: [],
          cursor: 0,
          completed: [],
          failed: [],
        })
      )
    ).toBeNull();
  });
});
