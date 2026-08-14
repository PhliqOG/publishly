import {
  computePublishingRetry,
  extractRetryMetadata,
  parseRetryHeaders,
  PUBLISH_RATE_LIMIT_CAP_SECONDS,
  PUBLISH_PRIORITY_RETRY_CAP_SECONDS,
  PUBLISH_RETRY_CAP_SECONDS,
} from './post.retry.policy';

describe('publishing retry policy', () => {
  const now = Date.parse('2026-08-10T12:00:00.000Z');

  it('uses deterministic bounded full jitter that grows exponentially', () => {
    const first = computePublishingRetry({
      postId: 'post-1',
      retryOrdinal: 0,
      nowMs: now,
    });
    const replay = computePublishingRetry({
      postId: 'post-1',
      retryOrdinal: 0,
      nowMs: now,
    });
    const late = computePublishingRetry({
      postId: 'post-1',
      retryOrdinal: 99,
      nowMs: now,
    });

    expect(first).toEqual(replay);
    expect(first.delaySeconds).toBeGreaterThanOrEqual(1);
    expect(first.delaySeconds).toBeLessThanOrEqual(15);
    expect(late.jitterSeconds).toBeLessThanOrEqual(PUBLISH_RETRY_CAP_SECONDS);
  });

  it('never shortens Retry-After and caps hostile provider values', () => {
    const provider = computePublishingRetry({
      postId: 'post-1',
      retryOrdinal: 0,
      nowMs: now,
      metadata: { retryAfterSeconds: 900 },
    });
    const hostile = computePublishingRetry({
      postId: 'post-1',
      retryOrdinal: 0,
      nowMs: now,
      metadata: { retryAfterSeconds: 999_999_999 },
    });
    expect(provider.delaySeconds).toBe(900);
    expect(hostile.delaySeconds).toBe(PUBLISH_RATE_LIMIT_CAP_SECONDS);
  });

  it('gives priority tiers a shorter internal lane without shortening provider limits', () => {
    const standard = computePublishingRetry({
      postId: 'post-priority',
      retryOrdinal: 99,
      nowMs: now,
    });
    const priority = computePublishingRetry({
      postId: 'post-priority',
      retryOrdinal: 99,
      nowMs: now,
      priority: true,
    });
    const rateLimited = computePublishingRetry({
      postId: 'post-priority',
      retryOrdinal: 0,
      nowMs: now,
      priority: true,
      metadata: { retryAfterSeconds: 900 },
    });

    expect(standard.jitterSeconds).toBeLessThanOrEqual(
      PUBLISH_RETRY_CAP_SECONDS
    );
    expect(priority.jitterSeconds).toBeLessThanOrEqual(
      PUBLISH_PRIORITY_RETRY_CAP_SECONDS
    );
    expect(priority.priority).toBe(true);
    expect(rateLimited.delaySeconds).toBe(900);
  });

  it('parses delta, HTTP-date, and epoch reset headers', () => {
    expect(parseRetryHeaders({ 'Retry-After': '120' }, now)).toEqual({
      retryAfterSeconds: 120,
    });
    expect(
      parseRetryHeaders({ 'Retry-After': 'Mon, 10 Aug 2026 12:05:00 GMT' }, now)
    ).toEqual({ retryAt: '2026-08-10T12:05:00.000Z' });
    expect(
      parseRetryHeaders({ 'x-rate-limit-reset': String(now / 1000 + 60) }, now)
    ).toEqual({
      retryAt: '2026-08-10T12:01:00.000Z',
    });
  });

  it('extracts retry metadata from nested Temporal details', () => {
    expect(
      extractRetryMetadata({
        cause: { details: [{ failure: {}, retryAfterSeconds: 42 }] },
      })
    ).toEqual({ retryAfterSeconds: 42, retryAt: undefined });
  });
});
