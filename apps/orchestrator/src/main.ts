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
  checker.checkSecretStrength('JWT_SECRET');

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }
    if (process.env.CONFIG_STRICT === 'true') {
      Logger.error('CONFIG_STRICT=true - refusing to run with config issues.');
      process.exit(1);
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);
  checkConfiguration();
}


bootstrap();
