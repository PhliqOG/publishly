import { Injectable } from '@nestjs/common';
import { CreationMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PostCreationAllocation } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { NormalizedPostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

export type PostCreationClaim =
  | {
      type: 'acquired';
      requestId: string;
      leaseToken: string;
    }
  | { type: 'replay'; response: unknown }
  | { type: 'mismatch' }
  | { type: 'in_progress'; retryAfterSeconds: number };

type ClaimInput = {
  organizationId: string;
  keyHash: string;
  requestHash: string;
  creationMethod: CreationMethod;
  allocation: PostCreationAllocation;
  now?: Date;
  leaseSeconds?: number;
};

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code === 'P2002'
      : (error as { code?: string } | null)?.code === 'P2002'
  );
}

@Injectable()
export class PostCreationRequestRepository {
  constructor(
    private _db: PrismaRepository<'postCreationRequest'>,
    private _transaction: PrismaTransaction
  ) {}

  async claim(input: ClaimInput, afterUniqueConflict = false): Promise<PostCreationClaim> {
    const now = input.now ?? new Date();
    const leaseUntil = new Date(
      now.getTime() + Math.max(30, input.leaseSeconds ?? 900) * 1000
    );
    const leaseToken = randomUUID();

    try {
      return await this._transaction.model.$transaction(async (tx) => {
        const existing = await tx.postCreationRequest.findUnique({
          where: {
            organizationId_keyHash: {
              organizationId: input.organizationId,
              keyHash: input.keyHash,
            },
          },
        });

        if (!existing) {
          if (afterUniqueConflict) {
            throw new Error(
              'The idempotency request could not be read after a concurrent claim.'
            );
          }
          const created = await tx.postCreationRequest.create({
            data: {
              organizationId: input.organizationId,
              keyHash: input.keyHash,
              requestHash: input.requestHash,
              creationMethod: input.creationMethod,
              status: 'IN_PROGRESS',
              leaseToken,
              leaseUntil,
              allocatedPostIds: input.allocation as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          return { type: 'acquired', requestId: created.id, leaseToken };
        }

        if (
          existing.requestHash !== input.requestHash ||
          existing.creationMethod !== input.creationMethod
        ) {
          return { type: 'mismatch' };
        }

        if (existing.status === 'COMPLETED' && existing.response !== null) {
          return { type: 'replay', response: existing.response };
        }

        if (
          existing.status === 'IN_PROGRESS' &&
          existing.leaseUntil &&
          existing.leaseUntil.getTime() > now.getTime()
        ) {
          return {
            type: 'in_progress',
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((existing.leaseUntil.getTime() - now.getTime()) / 1000)
            ),
          };
        }

        const claimed = await tx.postCreationRequest.updateMany({
          where: {
            id: existing.id,
            requestHash: input.requestHash,
            OR: [
              { status: 'FAILED' },
              { status: 'IN_PROGRESS', leaseUntil: { lte: now } },
            ],
          },
          data: {
            status: 'IN_PROGRESS',
            leaseToken,
            leaseUntil,
            attempts: { increment: 1 },
          },
        });

        if (claimed.count === 0) {
          return { type: 'in_progress', retryAfterSeconds: 1 };
        }
        return { type: 'acquired', requestId: existing.id, leaseToken };
      });
    } catch (error) {
      if (isUniqueConflict(error) && !afterUniqueConflict) {
        return this.claim(input, true);
      }
      throw error;
    }
  }

  async complete(requestId: string, leaseToken: string, response: unknown) {
    const completed = await this._db.model.postCreationRequest.updateMany({
      where: { id: requestId, leaseToken, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        response: response as Prisma.InputJsonValue,
        completedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
        lastFailureClass: null,
        lastFailureCode: null,
        lastFailureReason: null,
      },
    });
    if (completed.count !== 1) {
      throw new Error(
        'The idempotency request lease changed before its response was committed.'
      );
    }
  }

  async fail(
    requestId: string,
    leaseToken: string,
    failure: NormalizedPostFailure
  ) {
    const failed = await this._db.model.postCreationRequest.updateMany({
      where: { id: requestId, leaseToken, status: 'IN_PROGRESS' },
      data: {
        status: 'FAILED',
        leaseToken: null,
        leaseUntil: null,
        lastFailureClass: failure.failureClass,
        lastFailureCode: failure.code,
        lastFailureReason: failure.reason,
      },
    });
    if (failed.count !== 1) {
      throw new Error(
        'The idempotency request failure could not be committed to its active lease.'
      );
    }
  }
}
