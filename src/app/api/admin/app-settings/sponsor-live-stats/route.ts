import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isAdmin, isModerator } from '@/lib/auth/roles';
import { getSponsorLiveStatsVisibility } from '@/lib/services/app-settings';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const UPDATE_SCHEMA = z.object({
  publicVisible: z.boolean(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 60 } as const;

export const GET = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
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

  const settings = await getSponsorLiveStatsVisibility();
  return NextResponse.json({ ok: true, settings });
}, 'admin-sponsor-live-stats-visibility-get');

export const PATCH = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-live-stats-visibility:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ ok: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
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

  const userRate = checkRateLimit(`admin-sponsor-live-stats-visibility:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('app_settings').upsert(
    {
      id: true,
      sponsor_live_stats_public: parsed.data.publicVisible,
      updated_by: user.id,
    },
    { onConflict: 'id' },
  );

  if (error) {
    console.error('Failed to update sponsor live stats visibility', error);
    return NextResponse.json({ ok: false, error: 'Failed to update settings.' }, { status: 400 });
  }

  const settings = await getSponsorLiveStatsVisibility();
  return NextResponse.json({ ok: true, settings });
}, 'admin-sponsor-live-stats-visibility-update');
