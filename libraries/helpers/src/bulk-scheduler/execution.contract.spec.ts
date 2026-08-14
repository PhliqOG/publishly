import {
  canTransitionBulkCampaignJob,
  orderBulkAssets,
  planBulkCampaign,
  resolveLocalWallClock,
} from './execution.contract';
import { BulkCampaignIntentV1 } from './campaign.contract';

function intent(
  overrides: Partial<BulkCampaignIntentV1> = {}
): BulkCampaignIntentV1 {
  return {
    schemaVersion: 1,
    selection: {
      destinations: [
        { integrationId: 'ig-1', capabilityTupleId: 'instagram.professional.reel.video' },
        { integrationId: 'tt-1', capabilityTupleId: 'tiktok.creator.direct.video' },
      ],
    },
    distribution: { mode: 'cross_post' },
    cadence: { scope: 'campaign', postsPerDay: 3 },
    schedule: {
      startDate: '2026-08-17',
      endDate: '2026-08-18',
      weekdays: [1, 2, 3, 4, 5],
      timezone: 'America/New_York',
      windowStart: '09:00',
      windowEnd: '17:00',
      spacingMinutes: 60,
      slotStrategy: 'fixed',
      conflictBehavior: 'next_available',
    },
    ordering: { mode: 'upload' },
    ...overrides,
  };
}

const assets = Array.from({ length: 4 }, (_, position) => ({
  id: `asset-${position}`,
  originalName: `${position}.mp4`,
  position,
}));

describe('Bulk Scheduler deterministic execution contract', () => {
  it('shows exact cross-post expansion and overflows every item beyond capacity', () => {
    const result = planBulkCampaign({ assets, intent: intent() });
    expect(result.expansion).toEqual({
      assetCount: 4,
      destinationCount: 2,
      expandedJobCount: 8,
      formula: '4 assets × 2 destinations = 8 jobs',
    });
    expect(result.jobs).toHaveLength(6);
    expect(result.overflow).toHaveLength(2);
    expect(result.overflow.every((item) => item.code === 'capacity_shortage')).toBe(
      true
    );
  });

  it('distributes assets deterministically and applies cadence per account', () => {
    const result = planBulkCampaign({
      assets,
      intent: intent({
        distribution: { mode: 'distribute' },
        cadence: { scope: 'per_account', postsPerDay: 1 },
        schedule: {
          ...intent().schedule,
          endDate: '2026-08-18',
        },
      }),
    });
    expect(result.expansion.expandedJobCount).toBe(4);
    expect(result.jobs).toHaveLength(4);
    expect(result.jobs.map((job) => job.destinationOrdinal)).toEqual([0, 1, 0, 1]);
    expect(result.jobs[0].slot.scheduledAt).toEqual(result.jobs[1].slot.scheduledAt);
  });

  it('uses a stable filename order and deterministic seeded shuffle', () => {
    const unordered = [
      { id: 'z', originalName: 'B.mp4', position: 0 },
      { id: 'a', originalName: 'a.mp4', position: 1 },
      { id: 'b', originalName: 'a.mp4', position: 2 },
    ];
    expect(orderBulkAssets(unordered, { mode: 'filename' }).map((a) => a.id)).toEqual([
      'a',
      'b',
      'z',
    ]);
    const first = orderBulkAssets(unordered, {
      mode: 'deterministic_shuffle',
      seed: 'campaign-17',
    }).map((a) => a.id);
    const second = orderBulkAssets([...unordered].reverse(), {
      mode: 'deterministic_shuffle',
      seed: 'campaign-17',
    }).map((a) => a.id);
    expect(first).toEqual(second);
  });

  it('rejects best-time rather than silently substituting another strategy', () => {
    expect(() =>
      planBulkCampaign({
        assets,
        intent: intent({
          schedule: { ...intent().schedule, slotStrategy: 'best_time' },
        }),
      })
    ).toThrow('best_time_not_available');
  });

  it('rejects more than 100,000 expanded jobs before allocating the expansion', () => {
    expect(() =>
      planBulkCampaign({
        assets: Array.from({ length: 1_001 }, (_, position) => ({
          id: `large-${position}`,
          originalName: `${position}.mp4`,
          position,
        })),
        intent: intent({
          selection: {
            destinations: Array.from({ length: 100 }, (_, index) => ({
              integrationId: `ig-${index}`,
              capabilityTupleId: 'instagram.professional.reel.video',
            })),
          },
        }),
      })
    ).toThrow('campaign_expansion_limit_exceeded');
  });

  it('classifies a DST gap and deterministically persists both fall-back folds', () => {
    expect(
      resolveLocalWallClock({
        date: '2026-03-08',
        minutes: 2 * 60 + 30,
        timezone: 'America/New_York',
      })
    ).toEqual([]);
    const fold = resolveLocalWallClock({
      date: '2026-11-01',
      minutes: 1 * 60 + 30,
      timezone: 'America/New_York',
    });
    expect(fold).toHaveLength(2);
    expect(fold.map((slot) => slot.dstFold)).toEqual([0, 1]);
    expect(fold.map((slot) => slot.utcOffsetMinutes)).toEqual([-240, -300]);
  });

  it('keeps published terminal and permits explicit recovery transitions only', () => {
    expect(canTransitionBulkCampaignJob('PLANNED', 'RESERVING')).toBe(true);
    expect(canTransitionBulkCampaignJob('RETRYABLE_FAILURE', 'RESERVING')).toBe(true);
    expect(canTransitionBulkCampaignJob('PUBLISHED', 'PLANNED')).toBe(false);
    expect(canTransitionBulkCampaignJob('NEEDS_REVIEW', 'DISPATCHING')).toBe(true);
  });
});
