import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';

type RouteHandler = (request: any, context?: any) => Promise<Response> | Response;

const SENTRY_ENABLED = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);

export function withSentryRoute<T extends RouteHandler>(handler: T, name = 'route'): T {
  if (!SENTRY_ENABLED) {
    return handler;
  }

  return (wrapRouteHandlerWithSentry as any)(handler as any, {}) as any as T;
}
