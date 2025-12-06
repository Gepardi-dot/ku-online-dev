import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) {
    return;
  }

  const commonOptions = {
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    profilesSampleRate: 0,
    enabled: true,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  };

  // Next exposes NEXT_RUNTIME to differentiate between edge and node runtimes.
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(commonOptions);
    return;
  }

  Sentry.init(commonOptions);
}

export function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  errorContext: { routerKind: string; routePath: string; routeType: string },
) {
  if (!dsn) {
    return;
  }

  Sentry.captureRequestError(error, request, errorContext);
}
