import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import dayjs from 'dayjs';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { BulkImportService } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { CreateBulkImportDto } from '@gitroom/nestjs-libraries/dtos/bulk/create.bulk.import.dto';
import { BulkPostsActionDto } from '@gitroom/nestjs-libraries/dtos/bulk/bulk.posts.action.dto';

@ApiTags('Bulk')
@Controller('/bulk')
export class BulkImportController {
  constructor(
    private _bulkImportService: BulkImportService,
    private _postsService: PostsService,
    private _auditLogService: AuditLogService
  ) {}

  @Post('/import')
  async createImport(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateBulkImportDto
  ) {
    try {
      const result = await this._bulkImportService.createImport(
        org.id,
        body.name,
        body.csv
      );
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'bulk.import-created',
        targetType: 'bulkImport',
        targetId: result.id,
        metadata: { totalRows: result.totalRows, validRows: result.validRows },
      });
      return result;
    } catch (err: any) {
      throw new HttpException(err?.message || 'Invalid CSV', 400);
    }
  }

  @Get('/import')
  list(@GetOrgFromRequest() org: Organization) {
    return this._bulkImportService.list(org.id);
  }

  @Get('/import/:id')
  async getImport(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const found = await this._bulkImportService.getImport(org.id, id);
    if (!found) {
      throw new HttpException('Import not found', 404);
    }
    return found;
  }

  @Post('/import/:id/commit')
  async commit(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    try {
      const result = await this._bulkImportService.commit(org.id, id);
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'bulk.import-committed',
        targetType: 'bulkImport',
        targetId: id,
      });
      return result;
    } catch (err: any) {
      throw new HttpException(err?.message || 'Cannot commit import', 400);
    }
  }

  // Bulk operations on already-scheduled posts (calendar multi-select).
  @Post('/posts/shift')
  async shiftPosts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BulkPostsActionDto
  ) {
    if (!body.minutes) {
      throw new HttpException('minutes is required for shift', 400);
    }
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of body.ids) {
      try {
        const post = await this._postsService.getPostById(id, org.id);
        if (!post) {
          results.push({ id, ok: false, error: 'not found' });
          continue;
        }
        const newDate = dayjs(post.publishDate)
          .add(body.minutes, 'minutes')
          .toISOString();
        await this._postsService.changeDate(org.id, id, newDate);
        results.push({ id, ok: true });
      } catch (err: any) {
        results.push({ id, ok: false, error: err?.message });
      }
    }
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'bulk.posts-shifted',
      metadata: { count: body.ids.length, minutes: body.minutes },
    });
    return { results };
  }

  @Post('/posts/delete')
  async deletePosts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BulkPostsActionDto
  ) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const group of body.ids) {
      try {
        await this._postsService.deletePost(org.id, group);
        results.push({ id: group, ok: true });
      } catch (err: any) {
        results.push({ id: group, ok: false, error: err?.message });
      }
    }
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'bulk.posts-deleted',
      metadata: { count: body.ids.length },
    });
    return { results };
  }
}
