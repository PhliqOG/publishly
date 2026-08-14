import {
  bulkExpansionMath,
  clientUploadId,
  selectedDestinationAvailability,
} from './bulk-scheduler.logic';

describe('Bulk Scheduler UI contract', () => {
  it('shows exact expansion math before confirmation', () => {
    expect(
      bulkExpansionMath({
        assetCount: 80,
        destinationCount: 18,
        distributionMode: 'cross_post',
      })
    ).toEqual({
      assetCount: 80,
      destinationCount: 18,
      expandedJobCount: 1440,
      maximumExpandedJobs: 100000,
      overLimit: false,
      formula: '80 assets × 18 destinations = 1440 jobs',
    });
  });

  it('uses the shared planner limit and marks oversize previews before confirmation', () => {
    expect(
      bulkExpansionMath({
        assetCount: 1001,
        destinationCount: 100,
        distributionMode: 'cross_post',
      })
    ).toMatchObject({
      expandedJobCount: 100100,
      maximumExpandedJobs: 100000,
      overLimit: true,
    });
  });

  it('uses stable browser file identity across resume and reorders', () => {
    const file = {
      name: 'launch.mp4',
      size: 123,
      lastModified: 456,
      relativePath: 'campaign/launch.mp4',
    };
    expect(clientUploadId(file)).toBe(clientUploadId(file));
    expect(clientUploadId(file)).not.toBe(
      clientUploadId({ ...file, relativePath: 'other/launch.mp4' })
    );
  });

  it('renders availability only from matrix integration decisions', () => {
    expect(
      selectedDestinationAvailability({
        integrations: [{ id: 'ig-1', identifier: 'instagram' }],
        tuples: [
          {
            id: 'instagram.professional.reel.video',
            provider: 'instagram',
            integrationDecisions: [
              {
                integrationId: 'ig-1',
                eligible: false,
                code: 'real_provider_canary_required',
                reason: 'Canary required.',
              },
            ],
          },
        ],
      })
    ).toEqual([
      expect.objectContaining({
        eligible: false,
        code: 'real_provider_canary_required',
        reason: 'Canary required.',
      }),
    ]);
  });
});
