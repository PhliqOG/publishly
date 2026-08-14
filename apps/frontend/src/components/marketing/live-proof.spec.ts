import {
  formatLiveRate,
  LiveProofPayload,
  MIN_PUBLIC_DELIVERIES,
  summarizeLivePosting,
} from './live-proof';

const payload = (
  windows: Array<{ confirmed: number; failed: number }>
): LiveProofPayload => ({
  generatedAt: '2026-08-11T12:00:00.000Z',
  latestObservedAt: '2026-08-11T11:59:00.000Z',
  overall: { state: 'OPERATIONAL', reason: 'All systems are operational.' },
  posting: {
    platforms: windows.map((window, index) => ({
      provider: `provider-${index}`,
      windows: {
        last24Hours: {
          ...window,
          sampleSize: window.confirmed + window.failed,
          successRate: null,
        },
      },
    })),
  },
});

describe('homepage live posting proof', () => {
  it('combines real terminal outcomes across platforms', () => {
    expect(
      summarizeLivePosting(
        payload([
          { confirmed: 49, failed: 1 },
          { confirmed: 50, failed: 0 },
        ])
      )
    ).toEqual({
      confirmed: 99,
      failed: 1,
      sampleSize: 100,
      successRate: 99,
      hasEnoughEvidence: true,
    });
  });

  it('never turns a tiny or empty sample into a success claim', () => {
    const result = summarizeLivePosting(
      payload([{ confirmed: MIN_PUBLIC_DELIVERIES - 1, failed: 0 }])
    );
    expect(result.successRate).toBeNull();
    expect(result.hasEnoughEvidence).toBe(false);
    expect(formatLiveRate(result.successRate)).toBe('Collecting real data');
  });

  it('formats a proven rate without padded decimals', () => {
    expect(formatLiveRate(100)).toBe('100%');
    expect(formatLiveRate(99.37)).toBe('99.37%');
  });
});
