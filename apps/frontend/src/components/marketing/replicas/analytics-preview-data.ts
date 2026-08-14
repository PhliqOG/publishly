export type AnalyticsPreviewPoint = {
  day: string;
  date: string;
  value: number;
};

// Stable, illustrative observations for the public product preview. These are
// deliberately labelled as demo data in the UI; authenticated analytics use
// the connected account's provider snapshots instead.
export const ANALYTICS_PREVIEW_SERIES: AnalyticsPreviewPoint[] = [
  { day: 'Thu', date: 'Aug 6', value: 920 },
  { day: 'Fri', date: 'Aug 7', value: 1140 },
  { day: 'Sat', date: 'Aug 8', value: 1020 },
  { day: 'Sun', date: 'Aug 9', value: 1360 },
  { day: 'Mon', date: 'Aug 10', value: 1240 },
  { day: 'Tue', date: 'Aug 11', value: 1510 },
  { day: 'Wed', date: 'Aug 12', value: 1430 },
];

export const ANALYTICS_PREVIOUS_PERIOD_REACH = 7230;

const safeMetric = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : 0;

export function getAnalyticsPreviewSummary(
  points: AnalyticsPreviewPoint[],
  previousPeriodTotal: number
) {
  const values = points.map((point) => safeMetric(point.value));
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = values.length > 0 ? Math.max(...values) : 0;

  // Use five subdivisions at the current order of magnitude so the scale is
  // readable without wasting most of the plot area (1,510 -> 1,600).
  const magnitude = max > 0 ? 10 ** Math.floor(Math.log10(max)) : 1;
  const step = magnitude / 5;
  const scaleMax = max > 0 ? Math.ceil(max / step) * step : 1;
  const safePrevious = safeMetric(previousPeriodTotal);
  const changePercent =
    safePrevious > 0 ? ((total - safePrevious) / safePrevious) * 100 : null;

  return { total, max, scaleMax, changePercent };
}

export function getAnalyticsBarPercent(value: number, scaleMax: number) {
  if (!Number.isFinite(scaleMax) || scaleMax <= 0) return 0;
  return Math.min(100, (safeMetric(value) / scaleMax) * 100);
}

export function formatCompactMetric(value: number) {
  const safeValue = safeMetric(value);
  if (safeValue >= 1_000_000) {
    return `${Number((safeValue / 1_000_000).toFixed(1))}M`;
  }
  if (safeValue >= 1_000) {
    return `${Number((safeValue / 1_000).toFixed(1))}K`;
  }
  return String(Math.round(safeValue));
}
