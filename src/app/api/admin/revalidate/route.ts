import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { isAdminTokenAuthorized } from '@/lib/security/admin-token';
import { reportPrivilegedRouteEvent } from '@/lib/security/privileged-route-observability';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const env = getEnv();
const {
  ADMIN_REVALIDATE_TOKEN,
  NEXT_PUBLIC_SITE_URL,
} = env;

const REVALIDATE_RATE_LIMIT = { windowMs: 60_000, max: 5 } as const;
const PRIVILEGED_ROUTE = 'admin/revalidate';

const adminOriginAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

function isAuthorized(req: Request): boolean {
  if (!ADMIN_REVALIDATE_TOKEN) {
    console.warn('ADMIN_REVALIDATE_TOKEN missing in environment');
  }

  return isAdminTokenAuthorized(req, ADMIN_REVALIDATE_TOKEN);
}

function resolveHost(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isAllowedHost(req: Request): boolean {
  const hostHeader =
    req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const host = hostHeader.toLowerCase();
  if (!host) return false;

  const forwardedHost = process.env.VERCEL_URL
    ? process.env.VERCEL_URL.toLowerCase()
    : null;

  const allowlist = new Set(
    [
      'localhost:5000',
      '127.0.0.1:5000',
      'ku-online.vercel.app',
      forwardedHost,
      resolveHost(NEXT_PUBLIC_SITE_URL),
      resolveHost(process.env.SITE_URL),
    ].filter(Boolean) as string[],
  );

  if (allowlist.has(host)) {
    return true;
  }

  // Allow preview deployments for the same Vercel project (ku-online)
  if (host.endsWith('.vercel.app')) {
    if (host === 'ku-online.vercel.app') {
      return true;
    }
    if (host.includes('ku-online-')) {
      return true;
    }
  }

  return false;
}

function tooManyRequestsResponse(retryAfter: number) {
  const response = NextResponse.json({ error: 'Rate limit exceeded. Wait before calling revalidation again.' }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const POST = withSentryRoute(async (req: Request) => {
  const originHeader = req.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, adminOriginAllowList) && !isSameOriginRequest(req)) {
    reportPrivilegedRouteEvent({
      route: PRIVILEGED_ROUTE,
      method: 'POST',
      event: 'forbidden_origin',
      outcome: 'denied',
      status: 403,
      request: req,
      reason: 'origin_not_allowed',
    });
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(req.headers);
  if (clientIdentifier !== 'unknown') {
    const rate = await checkRateLimit(`revalidate:${clientIdentifier}`, REVALIDATE_RATE_LIMIT);
    if (!rate.success) {
      reportPrivilegedRouteEvent({
        route: PRIVILEGED_ROUTE,
        method: 'POST',
        event: 'rate_limited',
        outcome: 'rate_limited',
        status: 429,
        request: req,
        reason: 'ip_rate_limit',
        retryAfter: rate.retryAfter,
      });
      return tooManyRequestsResponse(rate.retryAfter);
    }
  }

  if (!isAllowedHost(req)) {
    reportPrivilegedRouteEvent({
      route: PRIVILEGED_ROUTE,
      method: 'POST',
      event: 'forbidden_host',
      outcome: 'denied',
      status: 403,
      request: req,
      reason: 'host_not_allowed',
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isAuthorized(req)) {
    reportPrivilegedRouteEvent({
      route: PRIVILEGED_ROUTE,
      method: 'POST',
      event: ADMIN_REVALIDATE_TOKEN ? 'unauthorized' : 'misconfigured',
      outcome: ADMIN_REVALIDATE_TOKEN ? 'denied' : 'misconfigured',
      status: 401,
      request: req,
      reason: ADMIN_REVALIDATE_TOKEN ? 'admin_token_invalid' : 'admin_token_missing',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      scope?: 'categories' | 'locations' | 'all';
      paths?: string[];
      tags?: string[];
    };

    const scope = body.scope ?? 'all';

    if (scope === 'categories' || scope === 'all') {
      revalidateTag('categories:list', 'max');
    }
    if (scope === 'locations' || scope === 'all') {
      revalidateTag('locations:list', 'max');
    }

    // Optional custom tags
    if (Array.isArray(body.tags)) {
      for (const t of body.tags) revalidateTag(t, 'max');
    }

    // Helpful defaults: refresh common pages
    const defaultPaths = ['/', '/products'];
    const paths = Array.isArray(body.paths) ? [...defaultPaths, ...body.paths] : defaultPaths;
    for (const p of paths) revalidatePath(p);

    reportPrivilegedRouteEvent({
      route: PRIVILEGED_ROUTE,
      method: 'POST',
      event: 'mutation_succeeded',
      outcome: 'succeeded',
      status: 200,
      request: req,
      subject: {
        scope,
        pathsCount: paths.length,
        tagsCount: Array.isArray(body.tags) ? body.tags.length : 0,
      },
    });

    return NextResponse.json({ ok: true, scope, paths });
  } catch (error) {
    reportPrivilegedRouteEvent({
      route: PRIVILEGED_ROUTE,
      method: 'POST',
      event: 'mutation_failed',
      outcome: 'failed',
      status: 500,
      request: req,
      reason: 'revalidation_failed',
    });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
});

function methodNotAllowed() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
