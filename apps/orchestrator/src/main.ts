import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '@gitroom/orchestrator/app.module';
import { ConfigurationChecker } from '@gitroom/helpers/configuration/configuration.checker';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

function checkConfiguration() {
  const checker = new ConfigurationChecker();
  checker.readEnvFromProcess();
  checker.check();

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.CONFIG_STRICT === 'true'
    ) {
      throw new Error(
        `Production configuration is invalid; refusing to run with ${checker.getIssuesCount()} issue(s).`
      );
    }
  }
}

async function bootstrap() {
  checkConfiguration();

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);
}


bootstrap().catch((error) => {
  const reason =
    error instanceof Error ? error.stack || error.message : String(error);
  Logger.error('Orchestrator failed to start.', reason);
  process.exitCode = 1;
});
