import {
  formatStatusPercent,
  statusLabel,
  statusPlatformName,
  STATUS_FETCH_FAILURE_MESSAGE,
} from './status-format';

describe('public status formatting', () => {
  it('never formats missing evidence as 100%', () => {
    expect(formatStatusPercent(null)).toBe('No data yet');
    expect(formatStatusPercent(100)).toBe('100%');
    expect(formatStatusPercent(99.125)).toBe('99.13%');
  });

  it('has an explicit fail-closed message for an unreachable status API', () => {
    expect(STATUS_FETCH_FAILURE_MESSAGE).toMatch(/unavailable/i);
    expect(STATUS_FETCH_FAILURE_MESSAGE).toMatch(/unknown/i);
  });

  it('uses explicit user-facing status labels', () => {
    expect(statusLabel('OPERATIONAL')).toBe('Operational');
    expect(statusLabel('INSUFFICIENT_DATA')).toBe('Not enough data yet');
  });

  it('uses known platform names and safely humanizes unknown identifiers', () => {
    expect(statusPlatformName('tiktok')).toBe('TikTok');
    expect(statusPlatformName('linkedin-page')).toBe('LinkedIn Pages');
    expect(statusPlatformName('new_network')).toBe('New Network');
  });
});
