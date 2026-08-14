import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { Prisma } from '@prisma/client';

export type MediaMetadata = {
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  sha256?: string | null;
  thumbnail?: string | null;
  thumbnailFileSize?: number;
  metadataStatus?: 'READY' | 'PARTIAL' | 'PENDING';
};

@Injectable()
export class MediaRepository {
  constructor(private _media: PrismaRepository<'media' | 'post'>) {}

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize = 0,
    type = 'image',
    metadata: MediaMetadata = {}
  ) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
        fileSize,
        type,
        ...metadata,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        fileSize: true,
        thumbnailFileSize: true,
        type: true,
        mimeType: true,
        width: true,
        height: true,
        durationSeconds: true,
        sha256: true,
        metadataStatus: true,
      },
    });
  }

  findDuplicate(organizationId: string, sha256: string) {
    return this._media.model.media.findFirst({
      where: { organizationId, sha256, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getStorageUsage(organizationId: string) {
    const aggregate = await this._media.model.media.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { fileSize: true, thumbnailFileSize: true },
    });
    return (
      (aggregate._sum.fileSize || 0) + (aggregate._sum.thumbnailFileSize || 0)
    );
  }

  getMediaById(organizationId: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  listDeletedBefore(before: Date, take = 100) {
    return this._media.model.media.findMany({
      where: { deletedAt: { lt: before } },
      orderBy: { deletedAt: 'asc' },
      take: Math.max(1, Math.min(take, 500)),
    });
  }

  hasActivePostReference(
    organizationId: string,
    mediaId: string,
    mediaPath: string
  ) {
    return this._media.model.post.count({
      where: {
        organizationId,
        deletedAt: null,
        state: { in: ['DRAFT', 'QUEUE'] },
        OR: [
          { image: { contains: mediaId } },
          { image: { contains: mediaPath } },
        ],
      },
    });
  }

  hardDelete(organizationId: string, id: string) {
    return this._media.model.media.deleteMany({
      where: { id, organizationId, deletedAt: { not: null } },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, search?: string) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    const searchFilter = trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        }
      : {};
    const query: Prisma.MediaCountArgs = {
      where: {
        organization: {
          id: org,
        },
        deletedAt: null,
        ...searchFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        ...searchFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }
}
