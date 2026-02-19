import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';
import { getDurablePwaTelemetrySummary, isDurableTelemetryEnabled } from '@/lib/pwa/telemetry-durable';
import { getPwaTelemetrySummary } from '@/lib/pwa/telemetry-store';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const env = getEnv();
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;

function parseWindowMinutes(value: string | null) {
  const fallback = 60;
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5, Math.min(24 * 60, Math.floor(parsed)));
}

function parseDisplayMode(value: string | null): 'all' | 'browser' | 'standalone' | 'unknown' {
  if (value === 'browser' || value === 'standalone' || value === 'unknown') {
    return value;
  }
  return 'all';
}

function parsePathPrefix(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 180) return normalized.slice(0, 180);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export const GET = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-pwa-telemetry-summary:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const userRate = checkRateLimit(`admin-pwa-telemetry-summary:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const url = new URL(request.url);
  const windowMinutes = parseWindowMinutes(url.searchParams.get('windowMinutes'));
  const displayMode = parseDisplayMode(url.searchParams.get('displayMode'));
  const pathPrefix = parsePathPrefix(url.searchParams.get('pathPrefix'));

  const options = {
    windowMinutes,
    displayMode,
    pathPrefix,
  } as const;

  let source: 'durable' | 'memory' = 'memory';
  let summary = null;

  if (isDurableTelemetryEnabled()) {
    summary = await getDurablePwaTelemetrySummary(options);
    if (summary) {
      source = 'durable';
    }
  }

  if (!summary) {
    summary = getPwaTelemetrySummary(options);
    source = 'memory';
  }

  return NextResponse.json({
    ok: true,
    source,
    durableEnabled: isDurableTelemetryEnabled(),
    summary,
  });
}, 'admin-pwa-telemetry-summary');
