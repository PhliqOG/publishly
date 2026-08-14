import {
  ANALYTICS_PREVIOUS_PERIOD_REACH,
  ANALYTICS_PREVIEW_SERIES,
  formatCompactMetric,
  getAnalyticsBarPercent,
  getAnalyticsPreviewSummary,
} from './analytics-preview-data';

describe('analytics marketing preview data', () => {
  it('derives the total, scale, and period change from numeric observations', () => {
    const summary = getAnalyticsPreviewSummary(
      ANALYTICS_PREVIEW_SERIES,
      ANALYTICS_PREVIOUS_PERIOD_REACH
    );

    expect(summary.total).toBe(8620);
    expect(summary.max).toBe(1510);
    expect(summary.scaleMax).toBe(1600);
    expect(summary.changePercent).toBeCloseTo(19.23, 2);
    expect(getAnalyticsBarPercent(summary.max, summary.scaleMax)).toBeCloseTo(
      94.375,
      3
    );
  });

  it('keeps missing or invalid observations from becoming invented chart data', () => {
    const summary = getAnalyticsPreviewSummary(
      [
        { day: 'Mon', date: 'Aug 10', value: Number.NaN },
        { day: 'Tue', date: 'Aug 11', value: -400 },
      ],
      0
    );

    expect(summary).toEqual({
      total: 0,
      max: 0,
      scaleMax: 1,
      changePercent: null,
    });
    expect(getAnalyticsBarPercent(Number.NaN, summary.scaleMax)).toBe(0);
    expect(getAnalyticsBarPercent(10, 0)).toBe(0);
  });

  it('formats visible axis and bar values without hiding their magnitude', () => {
    expect(formatCompactMetric(800)).toBe('800');
    expect(formatCompactMetric(1510)).toBe('1.5K');
    expect(formatCompactMetric(12_000)).toBe('12K');
    expect(formatCompactMetric(Number.NaN)).toBe('0');
  });
});
