import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { InboxState, User } from '@prisma/client';

export type InboxStatePatch = {
  read?: boolean;
  resolved?: boolean;
  assignedUserId?: string | null;
  internalNote?: string | null;
};

@Injectable()
export class InboxStateRepository {
  constructor(
    private _db: PrismaRepository<'inboxState' | 'userOrganization'>
  ) {}

  list(
    organizationId: string,
    integrationId: string,
    externalCommentIds: string[]
  ): Promise<
    Array<
      InboxState & {
        assignedUser: Pick<User, 'id' | 'name' | 'email' | 'pictureId'> | null;
      }
    >
  > {
    if (!externalCommentIds.length) {
      return Promise.resolve([]);
    }
    return this._db.model.inboxState.findMany({
      where: {
        organizationId,
        integrationId,
        externalCommentId: { in: externalCommentIds },
      },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true, pictureId: true },
        },
      },
    });
  }

  async assertWorkspaceMember(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const membership = await this._db.model.userOrganization.findFirst({
      where: { organizationId, userId, disabled: false },
      select: { id: true },
    });
    return !!membership;
  }

  update(
    organizationId: string,
    integrationId: string,
    externalCommentId: string,
    patch: InboxStatePatch
  ) {
    const data = {
      ...(patch.read !== undefined
        ? { readAt: patch.read ? new Date() : null }
        : {}),
      ...(patch.resolved !== undefined
        ? { resolvedAt: patch.resolved ? new Date() : null }
        : {}),
      ...(patch.assignedUserId !== undefined
        ? { assignedUserId: patch.assignedUserId }
        : {}),
      ...(patch.internalNote !== undefined
        ? { internalNote: patch.internalNote?.trim() || null }
        : {}),
    };

    return this._db.model.inboxState.upsert({
      where: {
        organizationId_integrationId_externalCommentId: {
          organizationId,
          integrationId,
          externalCommentId,
        },
      },
      create: {
        organizationId,
        integrationId,
        externalCommentId,
        ...data,
      },
      update: data,
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true, pictureId: true },
        },
      },
    });
  }
}
