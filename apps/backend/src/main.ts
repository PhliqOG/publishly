import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('backend', true);
import compression from 'compression';

import { loadSwagger } from '@gitroom/helpers/swagger/load.swagger';
import { json } from 'express';
import { randomUUID } from 'crypto';
import { Runtime } from '@temporalio/worker';
Runtime.install({ shutdownSignals: [] });

process.env.TZ = 'UTC';

import cookieParser from 'cookie-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { SubscriptionExceptionFilter } from '@gitroom/backend/services/auth/permissions/subscription.exception';
import { PostValidationExceptionFilter } from '@gitroom/backend/api/routes/posts.validation.exception';
import { HttpExceptionFilter } from '@gitroom/nestjs-libraries/services/exception.filter';
import { ConfigurationChecker } from '@gitroom/helpers/configuration/configuration.checker';
import { providerEnvRegistry } from '@gitroom/nestjs-libraries/integrations/provider.env.registry';
import { startMcp } from '@gitroom/nestjs-libraries/chat/start.mcp';
import {
  providerMediaBaseUrl,
  redactProviderMediaSecrets,
} from '@gitroom/helpers/bulk-scheduler/provider-media.contract';
import { BULK_SCHEDULER_CAPABILITY_MATRIX } from '@gitroom/helpers/bulk-scheduler/capability.matrix';
import { assertPrivateStorageConfiguration } from '@gitroom/nestjs-libraries/upload/private-media.storage';

async function start() {
  checkConfiguration();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      ...(!process.env.NOT_SECURED ? { credentials: true } : {}),
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'auth',
        'showorg',
        'impersonate',
        'X-Request-ID',
        'x-copilotkit-runtime-client-gql-version',
        'X-Request-ID',
      ],
      exposedHeaders: [
        'reload',
        'onboarding',
        'activate',
        'x-copilotkit-runtime-client-gql-version',
        ...(process.env.NOT_SECURED ? ['auth', 'showorg', 'impersonate'] : []),
      ],
      origin: [
        process.env.FRONTEND_URL,
        'http://localhost:6274',
        ...(process.env.MAIN_URL ? [process.env.MAIN_URL] : []),
      ],
    },
  });

  await startMcp(app);

  app.use((req: any, res: any, next: any) => {
    const supplied = String(req.headers['x-request-id'] || '');
    const requestId = /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
      ? supplied
      : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(self)'
    );

    const started = Date.now();
    res.on('finish', () => {
      Logger.log(
        JSON.stringify({
          event: 'http_request',
          requestId,
          method: req.method,
          path: redactProviderMediaSecrets(
            String(req.originalUrl || req.url || '').split('?')[0]
          ),
          statusCode: res.statusCode,
          durationMs: Date.now() - started,
          workspaceId: req.org?.id,
        }),
        'Request'
      );
    });
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    })
  );

  app.use(['/copilot/{*splat}', '/posts'], (req: any, res: any, next: any) => {
    json({ limit: '50mb' })(req, res, next);
  });

  app.use(cookieParser());
  app.use(compression());
  app.useGlobalFilters(new SubscriptionExceptionFilter());
  app.useGlobalFilters(new PostValidationExceptionFilter());
  app.useGlobalFilters(new HttpExceptionFilter());

  loadSwagger(app);

  const port = process.env.PORT || 3000;

  await app.listen(port);
  console.log('Backend started successfully on port ' + port);
  Logger.log(`Backend is running on: http://localhost:${port}`);
}

function checkConfiguration() {
  const checker = new ConfigurationChecker();
  checker.readEnvFromProcess();
  checker.check();

  // Social providers: partial credentials mean the provider renders as
  // available and then fails mid-OAuth. All-or-nothing per provider.
  for (const [identifier, keys] of Object.entries(providerEnvRegistry)) {
    if (keys.length > 1) {
      checker.checkAllOrNone(`Provider "${identifier}"`, keys);
    }
  }
  checker.checkAllOrNone('Stripe billing', [
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_SIGNING_KEY',
  ]);

  const providerCanaryProfile =
    process.env.PUBLISHLY_RUNTIME_PROFILE === 'provider_canary';
  if (process.env.CONFIG_STRICT === 'true' && !providerCanaryProfile) {
    for (const key of [
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_SIGNING_KEY',
      'EMAIL_PROVIDER',
      'EMAIL_FROM_ADDRESS',
      'EMAIL_FROM_NAME',
      'PUBLISHLY_REQUIRED_PROVIDERS',
    ]) {
      checker.checkNonEmpty(key, 'Required by the public production launch.');
    }

    const launchProviders = String(
      process.env.PUBLISHLY_REQUIRED_PROVIDERS || ''
    )
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean);
    for (const provider of new Set(launchProviders)) {
      if (!(provider in providerEnvRegistry)) {
        checker.addIssue(
          `Launch provider "${provider}" is not registered by this build.`
        );
        continue;
      }
      for (const key of providerEnvRegistry[provider]) {
        checker.checkNonEmpty(
          key,
          `Required by launch provider "${provider}".`
        );
      }
    }

    if (process.env.EMAIL_PROVIDER === 'resend') {
      checker.checkNonEmpty('RESEND_API_KEY', 'Required for production email.');
    } else if (process.env.EMAIL_PROVIDER === 'nodemailer') {
      for (const key of [
        'EMAIL_HOST',
        'EMAIL_PORT',
        'EMAIL_USER',
        'EMAIL_PASS',
      ]) {
        checker.checkNonEmpty(key, 'Required for production SMTP email.');
      }
    } else if (process.env.EMAIL_PROVIDER) {
      checker.addIssue(
        'EMAIL_PROVIDER must be resend or nodemailer in production.'
      );
    }
  }
  if (process.env.STORAGE_PROVIDER === 'cloudflare') {
    for (const key of [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_ACCESS_KEY',
      'CLOUDFLARE_SECRET_ACCESS_KEY',
      'CLOUDFLARE_BUCKETNAME',
      'CLOUDFLARE_BUCKET_URL',
    ]) {
      checker.checkNonEmpty(key, 'Required when STORAGE_PROVIDER=cloudflare.');
    }
  }
  if (process.env.STORAGE_PROVIDER === 's3') {
    for (const key of [
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_BUCKET',
      'S3_PUBLIC_URL',
      'S3_REGION',
    ]) {
      checker.checkNonEmpty(key, 'Required when STORAGE_PROVIDER=s3.');
    }
  }

  const bulkTransportEnabled =
    process.env.BULK_SCHEDULER_CANARY_MODE?.toLowerCase() === 'true' ||
    BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.some(
      (tuple) => tuple.defaultEligible
    );
  if (bulkTransportEnabled) {
    try {
      assertPrivateStorageConfiguration();
    } catch (error) {
      checker.addIssue(
        error instanceof Error
          ? error.message
          : 'Bulk Scheduler private storage is invalid.'
      );
    }
    try {
      providerMediaBaseUrl(process.env);
    } catch (error) {
      checker.addIssue(
        error instanceof Error
          ? error.message
          : 'Bulk Scheduler provider media origin is invalid.'
      );
    }
  }

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }

    Logger.warn('Configuration issues found: ' + checker.getIssuesCount());

    // Production deployments opt into fail-fast so a misconfigured instance
    // never serves traffic; dev keeps the upstream warn-only behavior.
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.CONFIG_STRICT === 'true'
    ) {
      throw new Error(
        `Production configuration is invalid; refusing to run with ${checker.getIssuesCount()} issue(s).`
      );
    }
  } else {
    Logger.log('Configuration check completed without any issues');
  }
}

start().catch((error) => {
  const reason =
    error instanceof Error ? error.stack || error.message : String(error);
  Logger.error('Backend failed to start.', reason);
  process.exitCode = 1;
});
