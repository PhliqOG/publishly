import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class BulkImportRepository {
  constructor(private _bulkImport: PrismaRepository<'bulkImport'>) {}

  create(organizationId: string, name: string, totalRows: number) {
    return this._bulkImport.model.bulkImport.create({
      data: { organizationId, name, totalRows },
    });
  }

  getById(organizationId: string, id: string) {
    return this._bulkImport.model.bulkImport.findFirst({
      where: { id, organizationId },
    });
  }

  list(organizationId: string) {
    return this._bulkImport.model.bulkImport.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  update(
    organizationId: string,
    id: string,
    data: Partial<{
      status: string;
      totalRows: number;
      processedRows: number;
      validRows: number;
      report: string;
    }>
  ) {
    return this._bulkImport.model.bulkImport.updateMany({
      where: { id, organizationId },
      data,
    });
  }

  claim(organizationId: string, id: string) {
    return this._bulkImport.model.bulkImport.updateMany({
      where: { id, organizationId, status: 'preview' },
      data: { status: 'processing' },
    });
  }
}
