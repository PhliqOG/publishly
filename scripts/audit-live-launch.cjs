#!/usr/bin/env node

'use strict';

const path = require('node:path');
const manifest = require('../data/provider-approval-manifest.json');
const { auditLiveLaunch } = require('./live-launch-audit.lib.cjs');
const {
  loadEnvFile,
  validateProductionEnv,
} = require('./verify-production-env.cjs');
const {
  validateProviderReadiness,
} = require('./verify-provider-readiness.cjs');

function parseArgs(argv) {
  const options = {
    envFile: '.env.production',
    origin: '',
    json: false,
    processEnv: false,
  };
  let explicitEnvFile = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
    } else if (argument === '--env') {
      options.envFile = argv[++index];
      explicitEnvFile = true;
    } else if (argument === '--process-env') {
      options.processEnv = true;
    } else if (argument === '--origin') {
      options.origin = argv[++index];
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.envFile && !options.help) throw new Error('--env requires a file path.');
  if (options.processEnv && explicitEnvFile && !options.help) {
    throw new Error('--process-env and --env are mutually exclusive.');
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/audit-live-launch.cjs (--env <production.env> | --process-env) [--origin https://domain] [--json]',
    '',
    'Runs source-contract, production-environment, and deployed-domain checks.',
    'Use --process-env inside a deployed application container to audit its exact runtime environment.',
    'Secret values are never printed.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  let environment;
  if (options.processEnv) {
    environment = process.env;
  } else {
    try {
      environment = loadEnvFile(path.resolve(options.envFile)).env;
    } catch (error) {
      console.error(`Live launch audit could not read the production environment: ${error.message}`);
      return 2;
    }
  }

  const staticIssues = validateProviderReadiness();
  const environmentIssues = validateProductionEnv(environment);
  const origin =
    options.origin ||
    environment.FRONTEND_URL ||
    environment.MAIN_URL ||
    environment.PUBLISHLY_DOMAIN;

  let live;
  try {
    live = await auditLiveLaunch({ origin, env: environment, manifest });
  } catch (error) {
    console.error(`Live launch audit could not start: ${error.message}`);
    return 2;
  }

  const report = {
    schemaVersion: 1,
    observedAt: live.observedAt,
    origin: live.origin,
    passed:
      staticIssues.length === 0 &&
      environmentIssues.length === 0 &&
      live.issues.length === 0,
    summary: {
      staticIssues: staticIssues.length,
      environmentIssues: environmentIssues.length,
      livePass: live.summary.pass,
      liveFail: live.summary.fail,
      liveSkip: live.summary.skip,
    },
    staticIssues,
    environmentIssues,
    live,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Publishly live launch audit ${report.passed ? 'passed' : 'failed'} for ${report.origin}.`
    );
    console.log(
      `Static issues: ${report.summary.staticIssues}; environment issues: ${report.summary.environmentIssues}; live checks: ${report.summary.livePass} passed, ${report.summary.liveFail} failed, ${report.summary.liveSkip} skipped.`
    );
    for (const issue of staticIssues) {
      console.error(`- [static:${issue.code}] ${issue.reason}`);
    }
    for (const issue of environmentIssues) {
      console.error(`- [environment:${issue.code}] ${issue.reason}`);
    }
    for (const issue of live.issues) {
      console.error(`- [live:${issue.code}] ${issue.reason}`);
    }
    console.log('No secret values were printed.');
  }
  return report.passed ? 0 : 1;
}

module.exports = { main, parseArgs, usage };

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
