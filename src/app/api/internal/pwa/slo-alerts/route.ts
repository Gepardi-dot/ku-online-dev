import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { runPwaSloAlertCheck } from '@/lib/pwa/slo-alerts';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const alertSecret = env.PWA_SLO_ALERT_SECRET?.trim() || null;
const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 30 } as const;

function normalizeWindowMinutes(value: string | null) {
  const raw = Number(value ?? 60);
  if (!Number.isFinite(raw)) return 60;
  return Math.max(5, Math.min(24 * 60, Math.floor(raw)));
}

function normalizeDisplayMode(value: string | null): 'all' | 'browser' | 'standalone' | 'unknown' {
  if (value === 'browser' || value === 'standalone' || value === 'unknown') {
    return value;
  }
  return 'all';
}

function normalizePathPrefix(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 180) return normalized.slice(0, 180);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function readSecretFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const fallbackHeader = request.headers.get('x-pwa-alert-secret');
  return fallbackHeader?.trim() ?? '';
}

async function handler(request: Request) {
  if (!alertSecret) {
    return NextResponse.json({ ok: false, error: 'Alert secret is not configured.' }, { status: 503 });
  }

  const providedSecret = readSecretFromRequest(request);
  if (!providedSecret || providedSecret !== alertSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`pwa-slo-alert-run:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const response = NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
      response.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return response;
    }
  }

  const url = new URL(request.url);
  const windowMinutes = normalizeWindowMinutes(url.searchParams.get('windowMinutes'));
  const displayMode = normalizeDisplayMode(url.searchParams.get('displayMode'));
  const pathPrefix = normalizePathPrefix(url.searchParams.get('pathPrefix'));
  const force = url.searchParams.get('force') === 'true';

  const result = await runPwaSloAlertCheck({
    windowMinutes,
    displayMode,
    pathPrefix,
    force,
    triggeredBy: 'internal-api',
  });

  if (!result.ok && result.status === 'error') {
    return NextResponse.json({ ok: false, result }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result });
}

export const GET = withSentryRoute(handler, 'internal-pwa-slo-alerts-get');
export const POST = withSentryRoute(handler, 'internal-pwa-slo-alerts-post');
