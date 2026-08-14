#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = [
  'apps/backend/src',
  'apps/orchestrator/src',
  'libraries/nestjs-libraries/src',
  'libraries/helpers/src',
];
const APPROVED_PUBLISH_DATE_WRITERS = new Set([
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  'libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts',
]);
const APPROVED_POST_RETIREMENT_WRITERS = new Set([
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  'libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/calendar-reservation.repository.ts',
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  'libraries/nestjs-libraries/src/database/prisma/organizations/org-data.service.ts',
  'libraries/nestjs-libraries/src/database/prisma/meta-deletion/meta-data-deletion.service.ts',
  'libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/bulk-campaign-execution.repository.ts',
]);
const APPROVED_POST_REPOSITORY_CALLERS = new Set([
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
]);

function normalized(file) {
  return file.replaceAll('\\', '/');
}

function containsNamedProperty(node, names) {
  let found = false;
  function visit(child) {
    if (
      (ts.isPropertyAssignment(child) || ts.isShorthandPropertyAssignment(child)) &&
      child.name &&
      names.has(child.name.getText().replace(/["']/g, ''))
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function mutationDataContains(call, field) {
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText().replace(/["']/g, '') === 'data' &&
        containsNamedProperty(property.initializer, new Set([field]))
      ) {
        return true;
      }
    }
  }
  return false;
}

function callName(expression) {
  if (!ts.isPropertyAccessExpression(expression)) return '';
  return expression.getText().replace(/\s/g, '');
}

function findViolationsInText(relativeFile, sourceText) {
  const file = normalized(relativeFile);
  if (/\.(?:spec|test)\.[cm]?[tj]sx?$/.test(file)) return [];
  if (file.includes('/migrations/')) return [];
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const violations = [];
  function report(node, code, reason) {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push({
      file,
      line: position.line + 1,
      code,
      reason,
    });
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      const isPostMutation = /(?:^|\.)post\.(?:create|createMany|upsert|update|updateMany)$/.test(
        name
      );
      if (
        isPostMutation &&
        mutationDataContains(node, 'publishDate') &&
        !APPROVED_PUBLISH_DATE_WRITERS.has(file)
      ) {
        report(
          node,
          'calendar_direct_publish_date_write',
          'Post.publishDate mutations must cross the reservation-ledger writer boundary.'
        );
      }
      if (
        isPostMutation &&
        mutationDataContains(node, 'deletedAt') &&
        !APPROVED_POST_RETIREMENT_WRITERS.has(file)
      ) {
        report(
          node,
          'calendar_direct_post_retirement',
          'Post retirement must cancel active reservation rows in the same database transaction.'
        );
      }
      if (
        /(?:^|\.)createOrUpdatePost$/.test(name) &&
        !APPROVED_POST_REPOSITORY_CALLERS.has(file)
      ) {
        report(
          node,
          'calendar_repository_bypass',
          'Only PostsService may call the Post repository calendar mutation.'
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (
    APPROVED_POST_RETIREMENT_WRITERS.has(file) &&
    sourceText.includes('deletedAt:') &&
    !sourceText.includes('cancelCalendarReservationsInTransaction')
  ) {
    report(
      source,
      'calendar_retirement_ledger_missing',
      'An approved Post-retirement writer must call the generic reservation cancellation primitive.'
    );
  }
  return violations;
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(absolute));
    else if (/\.[cm]?tsx?$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

function scanRepository(root = ROOT) {
  const violations = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    for (const absolute of filesUnder(path.join(root, sourceRoot))) {
      const relative = normalized(path.relative(root, absolute));
      violations.push(
        ...findViolationsInText(relative, fs.readFileSync(absolute, 'utf8'))
      );
    }
  }
  return violations;
}

if (require.main === module) {
  const violations = scanRepository();
  if (violations.length) {
    process.stderr.write(`${JSON.stringify({ ok: false, violations }, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        guard: 'calendar-writer-architecture',
        approvedPublishDateWriters: [...APPROVED_PUBLISH_DATE_WRITERS],
        approvedPostRetirementWriters: [
          ...APPROVED_POST_RETIREMENT_WRITERS,
        ],
      })}\n`
    );
  }
}

module.exports = { findViolationsInText, scanRepository };
