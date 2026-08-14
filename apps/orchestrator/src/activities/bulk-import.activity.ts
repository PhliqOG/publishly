import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { BulkImportService } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.service';

@Injectable()
@Activity()
export class BulkImportActivity {
  constructor(private _bulkImportService: BulkImportService) {}

  @ActivityMethod()
  processBulkImportBatch(organizationId: string, importId: string) {
    return this._bulkImportService.processNextBatch(organizationId, importId);
  }
}
