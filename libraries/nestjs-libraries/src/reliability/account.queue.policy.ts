export type AccountQueueActivityFailureType =
  | 'retry'
  | 'stop'
  | 'bad-body'
  | 'timeout'
  | 'transient'
  | 'unknown';

export type AccountQueueFailureDisposition = {
  outcome: 'RETRY' | 'FAILED' | 'AMBIGUOUS';
  code: string;
  reason: string;
  shouldRetry: boolean;
  safeBeforeMutation: boolean;
  markUnconfirmed: boolean;
};

function withMessage(message: string, fallback: string) {
  return message.trim() || fallback;
}

export function accountQueueFailureDisposition(input: {
  type: AccountQueueActivityFailureType;
  message: string;
  mutationInvoked: boolean;
  retriesRemain: boolean;
}): AccountQueueFailureDisposition {
  if (input.type === 'retry' && input.retriesRemain) {
    return {
      outcome: 'RETRY',
      code: 'token_refreshed',
      reason: withMessage(
        input.message,
        'The provider rejected the expired token before accepting a post; retry is safe.'
      ),
      shouldRetry: true,
      safeBeforeMutation: false,
      markUnconfirmed: false,
    };
  }
  if (
    !input.mutationInvoked &&
    (input.type === 'timeout' || input.type === 'unknown') &&
    input.retriesRemain
  ) {
    return {
      outcome: 'RETRY',
      code: 'safe_before_mutation_retry',
      reason:
        'A pre-mutation activity failed before any post bytes were sent; retry is safe.',
      shouldRetry: true,
      safeBeforeMutation: true,
      markUnconfirmed: false,
    };
  }
  if (input.type === 'transient' && input.retriesRemain) {
    return {
      outcome: 'RETRY',
      code: 'provider_transient',
      reason: withMessage(
        input.message,
        'The provider confirmed no mutation was accepted; retry is safe.'
      ),
      shouldRetry: true,
      safeBeforeMutation: false,
      markUnconfirmed: false,
    };
  }
  if (
    input.mutationInvoked &&
    (input.type === 'timeout' || input.type === 'unknown')
  ) {
    return {
      outcome: 'AMBIGUOUS',
      code: 'outcome_unknown',
      reason:
        input.type === 'timeout'
          ? 'The provider mutation timed out after it began; its outcome is unknown.'
          : 'The provider mutation failed without proof that it was rejected; its outcome is unknown.',
      shouldRetry: false,
      safeBeforeMutation: false,
      markUnconfirmed: true,
    };
  }
  if (!input.mutationInvoked && ['timeout', 'unknown'].includes(input.type)) {
    return {
      outcome: 'FAILED',
      code: 'account_queue_infrastructure_exhausted',
      reason:
        'The destination queue could not safely reach the provider mutation after all retries.',
      shouldRetry: false,
      safeBeforeMutation: true,
      markUnconfirmed: false,
    };
  }
  if (input.type === 'stop') {
    return {
      outcome: 'FAILED',
      code: 'connection_reconnect_required',
      reason: withMessage(
        input.message,
        'The provider rejected the connection before accepting the post.'
      ),
      shouldRetry: false,
      safeBeforeMutation: false,
      markUnconfirmed: false,
    };
  }
  if (input.type === 'bad-body') {
    return {
      outcome: 'FAILED',
      code: 'provider_rejected_content',
      reason: withMessage(
        input.message,
        'The provider rejected the post data before accepting it.'
      ),
      shouldRetry: false,
      safeBeforeMutation: false,
      markUnconfirmed: false,
    };
  }
  return {
    outcome: 'FAILED',
    code:
      input.type === 'transient'
        ? 'provider_transient_exhausted'
        : 'publishing_failed',
    reason: withMessage(
      input.message,
      'The provider mutation reached a classified terminal failure before acceptance.'
    ),
    shouldRetry: false,
    safeBeforeMutation: false,
    markUnconfirmed: false,
  };
}
