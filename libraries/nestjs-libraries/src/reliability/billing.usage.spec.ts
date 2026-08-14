import {
  monthlyBillingWindow,
  successfulPostUsageProjection,
} from './billing.usage';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('successful-post billing usage', () => {
  it('uses UTC anniversary boundaries and starts the next window exactly on the boundary', () => {
    const anchor = new Date('2026-01-10T15:30:00.000Z');
    expect(
      monthlyBillingWindow(anchor, new Date('2026-03-10T15:29:59.999Z'))
    ).toEqual({
      start: new Date('2026-02-10T15:30:00.000Z'),
      end: new Date('2026-03-10T15:30:00.000Z'),
    });
    expect(
      monthlyBillingWindow(anchor, new Date('2026-03-10T15:30:00.000Z'))
    ).toEqual({
      start: new Date('2026-03-10T15:30:00.000Z'),
      end: new Date('2026-04-10T15:30:00.000Z'),
    });
  });

  it('clamps a month-end anchor without drifting later cycles', () => {
    const anchor = new Date('2026-01-31T12:00:00.000Z');
    expect(
      monthlyBillingWindow(anchor, new Date('2026-03-30T12:00:00.000Z'))
    ).toEqual({
      start: new Date('2026-02-28T12:00:00.000Z'),
      end: new Date('2026-03-31T12:00:00.000Z'),
    });
  });

  it('projects only confirmed-live usage against the resolved plan allowance', () => {
    expect(
      successfulPostUsageProjection({
        tier: 'TEAM',
        anchor: new Date('2026-08-01T00:00:00.000Z'),
        now: new Date('2026-08-10T00:00:00.000Z'),
        used: 14_999,
      })
    ).toMatchObject({
      metric: 'confirmed_live_destinations',
      tier: 'TEAM',
      limit: 15_000,
      used: 14_999,
      remaining: 1,
      exhausted: false,
    });
  });

  it('maps legacy ULTIMATE records to Scale and never returns negative remaining usage', () => {
    expect(
      successfulPostUsageProjection({
        tier: 'ULTIMATE',
        anchor: new Date('2026-08-01T00:00:00.000Z'),
        now: new Date('2026-08-10T00:00:00.000Z'),
        used: 100_005,
      })
    ).toMatchObject({
      tier: 'PRO',
      limit: 100_000,
      used: 100_005,
      remaining: 0,
      exhausted: true,
    });
  });

  it('fails loudly for invalid or future billing anchors', () => {
    expect(() =>
      monthlyBillingWindow(
        new Date('invalid'),
        new Date('2026-08-10T00:00:00.000Z')
      )
    ).toThrow(/valid anchor/i);
    expect(() =>
      monthlyBillingWindow(
        new Date('2026-08-11T00:00:00.000Z'),
        new Date('2026-08-10T00:00:00.000Z')
      )
    ).toThrow(/future/i);
  });

  it('keeps successful usage independent from deletable Post rows', () => {
    const schema = readFileSync(
      join(__dirname, '..', 'database', 'prisma', 'schema.prisma'),
      'utf8'
    );
    const model = schema.match(/model SuccessfulPostUsage \{[\s\S]*?\n\}/)?.[0];

    expect(model).toBeDefined();
    expect(model).toContain('postId');
    expect(model).not.toMatch(/\bpost\s+Post\b/);
    expect(model).not.toMatch(/references:\s*\[id\].*Post/);
  });
});
