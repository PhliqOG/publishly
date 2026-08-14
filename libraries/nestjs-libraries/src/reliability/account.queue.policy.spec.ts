import { accountQueueFailureDisposition } from './account.queue.policy';

describe('account queue workflow failure policy', () => {
  it.each([
    ['retry', true, false, 'token_refreshed'],
    ['transient', true, false, 'provider_transient'],
    ['timeout', true, true, 'safe_before_mutation_retry'],
    ['unknown', true, true, 'safe_before_mutation_retry'],
  ] as const)(
    'releases %s safely when retries remain (pre-mutation=%s)',
    (type, retriesRemain, safeBeforeMutation, code) => {
      expect(
        accountQueueFailureDisposition({
          type,
          message: '',
          mutationInvoked: type === 'retry' || type === 'transient',
          retriesRemain,
        })
      ).toMatchObject({
        outcome: 'RETRY',
        code,
        reason: expect.any(String),
        shouldRetry: true,
        safeBeforeMutation,
        markUnconfirmed: false,
      });
    }
  );

  it.each(['timeout', 'unknown'] as const)(
    'cools the account down when a %s happens after mutation starts',
    (type) => {
      expect(
        accountQueueFailureDisposition({
          type,
          message: '',
          mutationInvoked: true,
          retriesRemain: true,
        })
      ).toMatchObject({
        outcome: 'AMBIGUOUS',
        code: 'outcome_unknown',
        reason: expect.stringMatching(/unknown/i),
        shouldRetry: false,
        markUnconfirmed: true,
      });
    }
  );

  it.each([
    ['stop', true, 'connection_reconnect_required'],
    ['bad-body', true, 'provider_rejected_content'],
    ['transient', true, 'provider_transient_exhausted'],
    ['retry', true, 'publishing_failed'],
    ['timeout', false, 'account_queue_infrastructure_exhausted'],
    ['unknown', false, 'account_queue_infrastructure_exhausted'],
  ] as const)(
    'terminally releases %s without ambiguity when mutation=%s',
    (type, mutationInvoked, code) => {
      expect(
        accountQueueFailureDisposition({
          type,
          message: '',
          mutationInvoked,
          retriesRemain: false,
        })
      ).toMatchObject({
        outcome: 'FAILED',
        code,
        reason: expect.any(String),
        shouldRetry: false,
        markUnconfirmed: false,
      });
    }
  );

  it('preserves provider detail without ever allowing an empty reason', () => {
    expect(
      accountQueueFailureDisposition({
        type: 'bad-body',
        message: '  Video dimensions are invalid.  ',
        mutationInvoked: true,
        retriesRemain: false,
      }).reason
    ).toBe('Video dimensions are invalid.');
  });
});
