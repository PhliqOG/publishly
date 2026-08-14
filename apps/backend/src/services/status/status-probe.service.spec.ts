import 'reflect-metadata';

const ping = jest.fn();
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { ping: (...args: any[]) => ping(...args) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/public-status/public-status.service',
  () => ({ PublicStatusService: class PublicStatusService {} })
);
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { StatusProbeService } from './status-probe.service';

describe('StatusProbeService', () => {
  const now = new Date('2026-08-10T12:00:05.000Z');
  const originalRunCron = process.env.RUN_CRON;
  let database: jest.Mock;
  let recordSamples: jest.Mock;
  let service: StatusProbeService;

  beforeEach(() => {
    delete process.env.RUN_CRON;
    ping.mockReset().mockResolvedValue('PONG');
    database = jest.fn().mockResolvedValue({ id: 'health-only' });
    recordSamples = jest.fn().mockResolvedValue([]);
    service = new StatusProbeService(
      { organization: { findFirst: database } } as any,
      { recordSamples, cleanup: jest.fn() } as any
    );
  });

  afterAll(() => {
    if (originalRunCron === undefined) delete process.env.RUN_CRON;
    else process.env.RUN_CRON = originalRunCron;
  });

  it('records fresh evidence during bootstrap on the designated cron instance', async () => {
    process.env.RUN_CRON = 'true';
    await service.onApplicationBootstrap();
    expect(recordSamples).toHaveBeenCalledTimes(1);
  });

  it('does not write bootstrap evidence from a non-authority replica', async () => {
    await service.onApplicationBootstrap();
    expect(recordSamples).not.toHaveBeenCalled();
  });

  it('classifies, logs, and rethrows a bootstrap evidence failure', async () => {
    process.env.RUN_CRON = 'true';
    recordSamples.mockRejectedValue(new Error('status ledger unavailable'));
    const log = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'status ledger unavailable'
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'status_probe_bootstrap_failed',
        code: 'status_probe_bootstrap_failed',
        reason: expect.stringMatching(/status ledger unavailable/i),
      })
    );
  });

  it('records API, database, and Redis evidence together', async () => {
    await service.runProbe(now);
    expect(recordSamples).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          component: 'api',
          status: 'OPERATIONAL',
        }),
        expect.objectContaining({
          component: 'database',
          status: 'OPERATIONAL',
        }),
        expect.objectContaining({
          component: 'redis',
          status: 'OPERATIONAL',
        }),
      ],
      now
    );
  });

  it.each([
    ['database', () => database.mockRejectedValue(new Error('db down'))],
    ['redis', () => ping.mockRejectedValue(new Error('redis down'))],
  ])(
    'records a non-empty outage reason when %s fails',
    async (component, fail) => {
      fail();
      await service.runProbe(now);
      expect(recordSamples).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            component,
            status: 'OUTAGE',
            code: `${component}_unreachable`,
            reason: expect.stringMatching(/failed:/i),
          }),
        ]),
        now
      );
    }
  );

  it('propagates an evidence-ledger write failure', async () => {
    recordSamples.mockRejectedValue(new Error('status ledger unavailable'));
    await expect(service.runProbe(now)).rejects.toThrow(
      'status ledger unavailable'
    );
  });
});
