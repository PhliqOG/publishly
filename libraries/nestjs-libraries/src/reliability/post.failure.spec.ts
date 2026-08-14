import {
  failureDetails,
  normalizePostFailure,
  POST_FAILURE_CATALOG,
  POST_FAILURE_CLASSES,
} from './post.failure';

describe('post failure taxonomy', () => {
  it.each([
    ['429 Too Many Requests', 'rate_limited', 'recoverable'],
    ['provider transient before request', 'provider_unavailable', 'recoverable'],
    ['ECONNREFUSED before request', 'network_error', 'recoverable'],
    ['Access token invalid, re-authenticate', 'reconnect_required', 'user_action_needed'],
    ['Missing required scopes', 'permission_required', 'user_action_needed'],
    ['Channel disabled', 'account_disabled', 'user_action_needed'],
    ['Account banned from posting', 'account_restricted', 'user_action_needed'],
    ['Invalid video frame rate', 'invalid_media', 'data_problem'],
    ['Caption is too long', 'content_too_long', 'data_problem'],
    ['Privacy level mismatch', 'invalid_settings', 'data_problem'],
    ['This post type is unsupported', 'unsupported_content', 'data_problem'],
  ] as const)(
    'classifies %s as %s/%s',
    (reason, code, failureClass) => {
      expect(normalizePostFailure({ reason })).toMatchObject({
        code,
        failureClass,
      });
    }
  );

  it('maps every legacy category to the closed contract', () => {
    expect(
      normalizePostFailure({
        legacyCategory: 'authentication',
        willRetry: true,
      })
    ).toMatchObject({
      code: 'token_refresh_required',
      failureClass: 'recoverable',
    });
    expect(
      normalizePostFailure({ legacyCategory: 'authentication' })
    ).toMatchObject({
      code: 'reconnect_required',
      failureClass: 'user_action_needed',
    });
    expect(
      normalizePostFailure({ legacyCategory: 'outcome_unknown' })
    ).toMatchObject({
      code: 'outcome_unknown',
      failureClass: 'user_action_needed',
    });
  });

  it('treats any mutation with an ambiguous outcome as user action needed', () => {
    const failure = normalizePostFailure({
      error: new Error('socket hang up'),
      mutationMayHaveSucceeded: true,
      willRetry: false,
    });
    expect(failure).toEqual({
      failureClass: 'user_action_needed',
      code: 'outcome_unknown',
      reason: 'socket hang up',
      willRetry: false,
    });
  });

  it('does not automatically retry a timeout that may follow a provider mutation', () => {
    expect(
      normalizePostFailure({
        error: { type: 'TimeoutFailure', message: 'Activity timed out' },
      })
    ).toMatchObject({
      code: 'outcome_unknown',
      failureClass: 'user_action_needed',
      willRetry: false,
    });
  });

  it.each([undefined, null, '', 'Unknown Error', '{}', {}, { message: '' }])(
    'always supplies a useful reason for %p',
    (error) => {
      const failure = normalizePostFailure({ error });
      expect(failure.code).toBe('internal_error');
      expect(failure.reason.length).toBeGreaterThan(20);
      expect(failure.reason).not.toMatch(/unknown error/i);
    }
  );

  it('reads structured taxonomy from nested Temporal details', () => {
    const failure = normalizePostFailure({
      error: {
        message: 'Activity task failed',
        cause: {
          details: [
            {
              failure: {
                failureClass: 'data_problem',
                failureCode: 'invalid_media',
                failureReason: 'The attached video is 191 minutes long.',
              },
            },
          ],
        },
      },
    });
    expect(failure).toEqual({
      failureClass: 'data_problem',
      code: 'invalid_media',
      reason: 'The attached video is 191 minutes long.',
      willRetry: false,
    });
  });

  it('redacts secrets and bounds provider reasons', () => {
    const providerCapability = `pmg_${'a'.repeat(32)}.${'B'.repeat(43)}`;
    const failure = normalizePostFailure({
      reason:
        `Bearer secret-token access_token=abc123 video_url=https://api.publishly.test/provider-media/${providerCapability} ` +
        'provider detail '.repeat(500),
    });
    expect(failure.reason).not.toContain('secret-token');
    expect(failure.reason).not.toContain('abc123');
    expect(failure.reason).not.toContain(providerCapability);
    expect(failure.reason).toContain('/provider-media/[redacted]');
    expect(failure.reason.length).toBeLessThanOrEqual(2_000);
  });

  it('uses the catalog class even if a provider supplies a conflicting class', () => {
    const failure = normalizePostFailure({
      error: {
        failureCode: 'invalid_caption',
        failureClass: 'recoverable',
        failureReason: 'Caption contains a prohibited value.',
      },
    });
    expect(failure.failureClass).toBe('data_problem');
  });

  it('exports only the three promised classes and structured failure details', () => {
    expect(POST_FAILURE_CLASSES).toEqual([
      'recoverable',
      'user_action_needed',
      'data_problem',
    ]);
    expect(
      new Set(Object.values(POST_FAILURE_CATALOG).map((v) => v.failureClass))
    ).toEqual(new Set(POST_FAILURE_CLASSES));
    expect(
      failureDetails(
        normalizePostFailure({ code: 'queue_unavailable', willRetry: true })
      )
    ).toEqual({
      failureClass: 'recoverable',
      failureCode: 'queue_unavailable',
      failureReason:
        'Publishly could not place this post on the delivery queue. The post can be retried safely.',
      willRetry: true,
    });
  });
});
