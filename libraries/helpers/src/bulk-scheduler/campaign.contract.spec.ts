import {
  BULK_CAMPAIGN_ISSUE_CODES,
  bulkPageLimit,
  canTransitionBulkCampaign,
  decodeBulkCursor,
  encodeBulkCursor,
  isBulkCampaignIssueCode,
  validateBulkCampaignIntent,
} from './campaign.contract';

export const validBulkCampaignIntent = {
  schemaVersion: 1 as const,
  selection: {
    accountGroupId: 'group-1',
    tagIds: ['tag-1'],
    destinations: [
      {
        integrationId: 'integration-1',
        capabilityTupleId: 'instagram.professional.reel.video',
      },
    ],
  },
  distribution: { mode: 'cross_post' as const },
  cadence: { scope: 'per_account' as const, postsPerDay: 3 },
  schedule: {
    startDate: '2026-08-13',
    endDate: '2026-09-13',
    weekdays: [1, 2, 3, 4, 5],
    timezone: 'America/New_York',
    windowStart: '09:00',
    windowEnd: '17:00',
    spacingMinutes: 60,
    slotStrategy: 'even' as const,
    conflictBehavior: 'next_available' as const,
  },
  ordering: { mode: 'filename' as const },
};

describe('Bulk Scheduler campaign contract', () => {
  it('accepts a deterministic, fully specified campaign intent', () => {
    expect(validateBulkCampaignIntent(validBulkCampaignIntent)).toEqual({
      valid: true,
      value: validBulkCampaignIntent,
    });
  });

  it.each([
    [
      'unknown schema',
      { ...validBulkCampaignIntent, schemaVersion: 2 },
      /schemaVersion/,
    ],
    [
      'duplicate destination',
      {
        ...validBulkCampaignIntent,
        selection: {
          ...validBulkCampaignIntent.selection,
          destinations: [
            validBulkCampaignIntent.selection.destinations[0],
            validBulkCampaignIntent.selection.destinations[0],
          ],
        },
      },
      /duplicated/,
    ],
    [
      'invalid timezone',
      {
        ...validBulkCampaignIntent,
        schedule: {
          ...validBulkCampaignIntent.schedule,
          timezone: 'New_York-ish',
        },
      },
      /IANA timezone/,
    ],
    [
      'shuffle without seed',
      {
        ...validBulkCampaignIntent,
        ordering: { mode: 'deterministic_shuffle' },
      },
      /requires a non-empty seed/,
    ],
  ])('rejects %s with a machine code and reason', (_label, input, reason) => {
    const result = validateBulkCampaignIntent(input);
    expect(result).toMatchObject({
      valid: false,
      code: 'invalid_campaign_intent',
      reason: expect.stringMatching(reason as RegExp),
    });
  });

  it('defines explicit lifecycle transitions and makes terminal states terminal', () => {
    expect(canTransitionBulkCampaign('DRAFT', 'UPLOADING')).toBe(true);
    expect(canTransitionBulkCampaign('UPLOADING', 'COMPLETED')).toBe(false);
    expect(canTransitionBulkCampaign('PAUSED', 'PLANNING')).toBe(true);
    expect(canTransitionBulkCampaign('COMPLETED', 'DISPATCHING')).toBe(false);
    expect(canTransitionBulkCampaign('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('requires every stable issue code to define class, taxonomy, and retry behavior', () => {
    expect(Object.keys(BULK_CAMPAIGN_ISSUE_CODES).length).toBeGreaterThan(10);
    for (const [code, definition] of Object.entries(BULK_CAMPAIGN_ISSUE_CODES)) {
      expect(isBulkCampaignIssueCode(code)).toBe(true);
      expect(['blocked', 'failed', 'conflicted', 'quarantined', 'overflow']).toContain(
        definition.issueClass
      );
      expect(['recoverable', 'user_action_needed', 'data_problem']).toContain(
        definition.failureClass
      );
      expect(typeof definition.retryable).toBe('boolean');
    }
    expect(isBulkCampaignIssueCode('made_up_failure')).toBe(false);
  });

  it('round-trips collection-specific cursors and rejects cross-collection reuse', () => {
    const cursor = encodeBulkCursor({
      kind: 'campaign',
      timestamp: new Date('2026-08-12T20:00:00.000Z'),
      id: 'campaign-1',
    });
    expect(decodeBulkCursor(cursor, 'campaign')).toEqual({
      kind: 'campaign',
      timestamp: new Date('2026-08-12T20:00:00.000Z'),
      id: 'campaign-1',
    });
    expect(() => decodeBulkCursor(cursor, 'issue')).toThrow('invalid_cursor');
    expect(() => decodeBulkCursor('not+base64', 'campaign')).toThrow(
      'invalid_cursor'
    );
  });

  it('bounds cursor page sizes', () => {
    expect(bulkPageLimit(undefined)).toBe(50);
    expect(bulkPageLimit('100')).toBe(100);
    expect(() => bulkPageLimit(0)).toThrow('invalid_page_limit');
    expect(() => bulkPageLimit(101)).toThrow('invalid_page_limit');
  });
});
