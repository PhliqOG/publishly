import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { MetaDataDeletionService } from './meta-data-deletion.service';

function signedRequest(secret: string, userId = 'meta-user-1') {
  const payload = Buffer.from(
    JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: userId })
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${signature}.${payload}`;
}

describe('MetaDataDeletionService', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      FACEBOOK_APP_SECRET: 'facebook-test-secret',
      INSTAGRAM_APP_SECRET: '',
      THREADS_APP_SECRET: '',
      ENCRYPTION_SECRET: 'encryption-test-secret-with-enough-entropy',
      FRONTEND_URL: 'https://publishly.example',
    };
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  function setup(existing: any = null) {
    const tx: any = {
      metaDataDeletionRequest: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockImplementation(({ create }) => ({
          ...create,
          createdAt: new Date('2026-08-09T00:00:00Z'),
        })),
      },
      integration: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'connection-1', organizationId: 'workspace-1' },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      post: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'post-1', organizationId: 'workspace-1' },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inboxState: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      analyticsSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      integrationsWebhooks: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      comments: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      errors: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      publishingJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
      metaDataDeletionRequest: { findUnique: jest.fn() },
    };
    return { service: new MetaDataDeletionService(prisma), prisma, tx };
  }

  it('verifies Meta HMAC, erases provider data, and returns a status URL', async () => {
    const { service, tx } = setup();
    const result = await service.requestDeletion(
      signedRequest('facebook-test-secret')
    );

    expect(result.confirmation_code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(result.url).toBe(
      `https://publishly.example/data-deletion?code=${result.confirmation_code}`
    );
    expect(tx.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerIdentifier: { in: ['facebook', 'instagram'] },
        }),
      })
    );
    expect(tx.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: '',
          refreshToken: '',
          rootInternalId: null,
          deletedAt: expect.any(Date),
        }),
      })
    );
    expect(tx.publishingJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'CANCELLED' }),
      })
    );
    expect(tx.analyticsSnapshot.deleteMany).toHaveBeenCalled();
    expect(tx.inboxState.deleteMany).toHaveBeenCalled();
    expect(tx.calendarReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'CANCELLED',
          outcomeCode: 'calendar_meta_erasure_requested',
        }),
      })
    );
  });

  it('returns the original confirmation for a replay without repeating erasure', async () => {
    const existing = {
      confirmationCode: 'a'.repeat(32),
      status: 'COMPLETED',
    };
    const { service, tx } = setup(existing);

    await expect(
      service.requestDeletion(signedRequest('facebook-test-secret'))
    ).resolves.toEqual({
      confirmation_code: 'a'.repeat(32),
      url: `https://publishly.example/data-deletion?code=${'a'.repeat(32)}`,
    });
    expect(tx.integration.findMany).not.toHaveBeenCalled();
  });

  it('rejects a forged callback before touching the database', async () => {
    const { service, prisma } = setup();
    await expect(
      service.requestDeletion(signedRequest('wrong-secret'))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns only non-sensitive status fields for a valid confirmation', async () => {
    const { service, prisma } = setup();
    prisma.metaDataDeletionRequest.findUnique.mockResolvedValue({
      confirmationCode: 'b'.repeat(32),
      status: 'COMPLETED',
      connectionsDeleted: 2,
      createdAt: new Date('2026-08-09T00:00:00Z'),
      completedAt: new Date('2026-08-09T00:00:01Z'),
      subjectHash: 'must-not-leak',
      requestHash: 'must-not-leak',
    });

    await expect(service.getStatus('b'.repeat(32))).resolves.toMatchObject({
      confirmationCode: 'b'.repeat(32),
      status: 'completed',
      connectionsDeleted: 2,
    });
  });
});
