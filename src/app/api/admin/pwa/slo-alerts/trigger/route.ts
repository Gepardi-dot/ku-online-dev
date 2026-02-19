import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdmin } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { runPwaSloAlertCheck } from '@/lib/pwa/slo-alerts';
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

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 30 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 20 } as const;

const triggerSchema = z
  .object({
    windowMinutes: z.number().int().min(5).max(24 * 60).optional(),
    displayMode: z.enum(['all', 'browser', 'standalone', 'unknown']).optional(),
    pathPrefix: z.string().trim().max(180).nullable().optional(),
    force: z.boolean().optional(),
  })
  .strict();

function normalizePathPrefix(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 180) return normalized.slice(0, 180);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-pwa-slo-alert-trigger:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
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

  if (authError || !user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const userRate = checkRateLimit(`admin-pwa-slo-alert-trigger:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const payload = (await request.json().catch(() => ({}))) as unknown;
  const parsed = triggerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const result = await runPwaSloAlertCheck({
    windowMinutes: parsed.data.windowMinutes,
    displayMode: parsed.data.displayMode,
    pathPrefix: normalizePathPrefix(parsed.data.pathPrefix),
    force: Boolean(parsed.data.force),
    triggeredBy: `admin:${user.id}`,
  });

  if (!result.ok && result.status === 'error') {
    return NextResponse.json(
      {
        ok: false,
        error: result.reason ?? 'Failed to run alert check.',
        result,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, result });
}, 'admin-pwa-slo-alert-trigger');
