import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import calendarWriterGuard from '../../../../scripts/verify-calendar-writers.cjs';

const { findViolationsInText } = calendarWriterGuard;

describe('calendar writer architecture guard', () => {
  it('rejects a direct publishDate mutation outside the approved boundary', () => {
    const violations = findViolationsInText(
      'apps/backend/src/unsafe.ts',
      `async function unsafe(db: any) {
        return db.post.update({ where: { id: 'post' }, data: { publishDate: new Date() } });
      }`
    );
    expect(violations).toEqual([
      expect.objectContaining({ code: 'calendar_direct_publish_date_write' }),
    ]);
  });

  it('rejects a new direct caller of createOrUpdatePost', () => {
    const violations = findViolationsInText(
      'apps/orchestrator/src/unsafe.ts',
      `repository.createOrUpdatePost('schedule', 'org', 'date', body, [], 'API');`
    );
    expect(violations).toEqual([
      expect.objectContaining({ code: 'calendar_repository_bypass' }),
    ]);
  });

  it('rejects a post retirement outside the transactional ledger primitive', () => {
    const violations = findViolationsInText(
      'apps/backend/src/unsafe-delete.ts',
      `db.post.updateMany({ where: { organizationId: 'org' }, data: { deletedAt: new Date() } });`
    );
    expect(violations).toEqual([
      expect.objectContaining({ code: 'calendar_direct_post_retirement' }),
    ]);
  });

  it('rejects the campaign writer itself if reservation retirement is removed', () => {
    const violations = findViolationsInText(
      'libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.repository.ts',
      `tx.post.updateMany({ data: { deletedAt: new Date() } });`
    );
    expect(violations).toEqual([
      expect.objectContaining({ code: 'calendar_retirement_ledger_missing' }),
    ]);
  });

  it('allows campaign Post retirement only with the generic ledger primitive', () => {
    const violations = findViolationsInText(
      'libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.repository.ts',
      `await cancelCalendarReservationsInTransaction(tx, input);
       await tx.post.updateMany({ data: { deletedAt: new Date() } });`
    );
    expect(violations).toEqual([]);
  });

  it('allows the two reviewed repository implementations', () => {
    expect(
      findViolationsInText(
        'libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts',
        `tx.post.update({ where: { id: 'post' }, data: { publishDate: new Date() } });`
      )
    ).toEqual([]);
  });

  it('keeps reservation finalization ahead of publishing job/workflow dispatch', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts'
      ),
      'utf8'
    );
    const createStart = source.indexOf('async createPost(');
    const createEnd = source.indexOf('async updatePostSettings(', createStart);
    const create = source.slice(createStart, createEnd);
    const prepare = create.indexOf('_calendarWriter.prepareCreate');
    const postWrite = create.indexOf('_postRepository.createOrUpdatePost');
    const finalize = create.indexOf('_calendarWriter.finalizeCreate');
    const job = create.indexOf('_publishingJobRepository.ensure', finalize);
    const workflow = create.indexOf('this.startWorkflow(', finalize);
    expect(prepare).toBeGreaterThan(-1);
    expect(postWrite).toBeGreaterThan(prepare);
    expect(finalize).toBeGreaterThan(postWrite);
    expect(job).toBeGreaterThan(finalize);
    expect(workflow).toBeGreaterThan(finalize);
  });

  it('routes date changes and group cancellation through the calendar writer', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts'
      ),
      'utf8'
    );
    expect(source).toContain('this._calendarWriter.cancelGroup({');
    expect(source).toContain('this._calendarWriter.reschedule({');
    expect(source).not.toContain('this._postRepository.changeDate(');
    expect(source).not.toContain('this._postRepository.deletePost(');
  });
});
