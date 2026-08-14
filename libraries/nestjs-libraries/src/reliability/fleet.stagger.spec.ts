import {
  allocateFleetStagger,
  isValidIanaTimeZone,
  parseExplicitIsoDate,
} from './fleet.stagger';

describe('fleet stagger policy', () => {
  const start = new Date('2026-08-10T12:00:00.000Z');
  const end = new Date('2026-08-10T12:10:00.000Z');

  it('allocates stable, distinct slots in account-id order', () => {
    expect(
      allocateFleetStagger({
        integrationIds: ['connection-c', 'connection-a', 'connection-b'],
        windowStart: start,
        windowEnd: end,
        minimumSpacingSeconds: 60,
      })
    ).toEqual({
      ok: true,
      allocations: [
        {
          integrationId: 'connection-a',
          scheduledAt: new Date('2026-08-10T12:00:00.000Z'),
        },
        {
          integrationId: 'connection-b',
          scheduledAt: new Date('2026-08-10T12:03:20.000Z'),
        },
        {
          integrationId: 'connection-c',
          scheduledAt: new Date('2026-08-10T12:06:40.000Z'),
        },
      ],
    });
  });

  it('moves only the colliding account forward and preserves global spacing', () => {
    const result = allocateFleetStagger({
      integrationIds: ['connection-a', 'connection-b', 'connection-c'],
      windowStart: start,
      windowEnd: end,
      minimumSpacingSeconds: 60,
      existingByIntegration: {
        'connection-b': [new Date('2026-08-10T12:03:30.000Z')],
      },
    });
    expect(result).toEqual({
      ok: true,
      allocations: [
        expect.objectContaining({
          integrationId: 'connection-a',
          scheduledAt: new Date('2026-08-10T12:00:00.000Z'),
        }),
        expect.objectContaining({
          integrationId: 'connection-b',
          scheduledAt: new Date('2026-08-10T12:04:30.000Z'),
        }),
        expect.objectContaining({
          integrationId: 'connection-c',
          scheduledAt: new Date('2026-08-10T12:06:40.000Z'),
        }),
      ],
    });
  });

  it('rejects impossible windows and collision-exhausted windows with reasons', () => {
    expect(
      allocateFleetStagger({
        integrationIds: ['a', 'b', 'c'],
        windowStart: start,
        windowEnd: new Date('2026-08-10T12:01:00.000Z'),
        minimumSpacingSeconds: 60,
      })
    ).toMatchObject({
      ok: false,
      code: 'stagger_window_too_small',
      reason: expect.any(String),
    });
    expect(
      allocateFleetStagger({
        integrationIds: ['a'],
        windowStart: start,
        windowEnd: new Date('2026-08-10T12:02:00.000Z'),
        minimumSpacingSeconds: 60,
        existingByIntegration: {
          a: [
            new Date('2026-08-10T12:00:30.000Z'),
            new Date('2026-08-10T12:01:45.000Z'),
          ],
        },
      })
    ).toMatchObject({
      ok: false,
      code: 'stagger_window_exhausted',
      reason: expect.any(String),
    });
  });

  it('requires explicit offsets and handles a DST fall-back window unambiguously', () => {
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
    expect(isValidIanaTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(parseExplicitIsoDate('2026-11-01T01:30:00')).toBeNull();
    const first = parseExplicitIsoDate('2026-11-01T01:30:00-04:00');
    const second = parseExplicitIsoDate('2026-11-01T01:30:00-05:00');
    expect(first?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(second?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
});
