import * as Sentry from '@sentry/nestjs';
import { capitalize } from 'lodash';

const telemetryReason = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const setSentryUserContext = (params: {
  userId?: string;
  email?: string;
  orgId?: string;
  paymentId?: string | null;
}) => {
  try {
    Sentry.setUser(
      params.userId
        ? {
            id: params.userId,
            ...(params.email ? { email: params.email } : {}),
          }
        : null
    );
    if (params.orgId) {
      Sentry.setTag('organization.id', params.orgId);
    }
    if (params.paymentId?.startsWith('cus_')) {
      Sentry.setTag('stripe.customer_id', params.paymentId);
    }
  } catch (err) {
    console.error({
      event: 'sentry_user_context_failed',
      code: 'telemetry_context_unavailable',
      reason: telemetryReason(err, 'Sentry user context could not be updated.'),
    });
  }
};

export const initializeSentry = (appName: string, allowLogs = false) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return null;
  }

  try {
    const integrations: any[] = [
      Sentry.consoleLoggingIntegration({
        levels: ['log', 'info', 'warn', 'error', 'debug', 'assert', 'trace'],
      }),
      // Preserve model-call timing/error telemetry without exporting prompts,
      // captions, provider data, or generated output to the telemetry vendor.
      Sentry.openAIIntegration({
        recordInputs: false,
        recordOutputs: false,
      }),
    ];
    try {
      // The profiler is an optional native binary. Loading it only after a DSN
      // is configured keeps API/auth modules portable on unsupported hosts.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');
      integrations.unshift(nodeProfilingIntegration());
    } catch (error) {
      console.error({
        event: 'sentry_profiling_unavailable',
        code: 'telemetry_profiler_unavailable',
        reason: telemetryReason(
          error,
          'The optional Sentry profiling integration could not be loaded.'
        ),
      });
    }

    Sentry.init({
      initialScope: {
        tags: {
          service: appName,
          component: 'nestjs',
        },
        contexts: {
          app: {
            name: `${
              process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly'
            } ${capitalize(appName)}`,
          },
        },
      },
      environment: process.env.NODE_ENV || 'development',
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      spotlight: process.env.SENTRY_SPOTLIGHT === '1',
      integrations,
      tracesSampleRate: 1.0,
      enableLogs: true,

      // Profiling
      profileSessionSampleRate:
        process.env.NODE_ENV === 'development' ? 1.0 : 0.45,
      profileLifecycle: 'trace',
    });
  } catch (err) {
    console.error({
      event: 'sentry_initialization_failed',
      code: 'telemetry_initialization_failed',
      reason: telemetryReason(err, 'Sentry could not be initialized.'),
    });
    return null;
  }
  return true;
};
