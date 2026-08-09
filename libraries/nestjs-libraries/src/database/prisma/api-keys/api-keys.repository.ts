import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class ApiKeysRepository {
  constructor(private _apiKey: PrismaRepository<'apiKey'>) {}

  create(
    organizationId: string,
    name: string,
    prefix: string,
    hash: string,
    scopes: string[]
  ) {
    return this._apiKey.model.apiKey.create({
      data: {
        organizationId,
        name,
        prefix,
        hash,
        scopes: JSON.stringify(scopes),
      },
    });
  }

  getByHash(hash: string) {
    return this._apiKey.model.apiKey.findUnique({
      where: { hash },
      include: {
        organization: {
          include: { subscription: true },
        },
      },
    });
  }

  getKeys(organizationId: string) {
    return this._apiKey.model.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  revoke(organizationId: string, id: string) {
    return this._apiKey.model.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  touchLastUsed(id: string, olderThan: Date) {
    return this._apiKey.model.apiKey.updateMany({
      where: {
        id,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: olderThan } }],
      },
      data: { lastUsedAt: new Date() },
    });
  }
}
