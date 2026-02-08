import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseAdmin = createSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CLICK_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 240 } as const;

const clickOriginAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const ALLOWED_SOURCES = new Set(['spotlight_card', 'store_page']);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= 16 ? trimmed : trimmed.slice(0, 16);
}

function sanitizeSource(value: unknown): string {
  if (typeof value !== 'string') return 'spotlight_card';
  const normalized = value.trim().toLowerCase();
  if (!ALLOWED_SOURCES.has(normalized)) return 'spotlight_card';
  return normalized;
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function tooManyRequestsResponse(retryAfter: number) {
  const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const POST = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, clickOriginAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-store-click:ip:${clientIdentifier}`, CLICK_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter);
    }
  }

  const payload = await request.json().catch(() => null);
  const storeId = typeof payload?.storeId === 'string' ? payload.storeId : null;
  const locale = sanitizeLocale(payload?.locale);
  const source = sanitizeSource(payload?.source);

  if (!storeId || !isUuid(storeId)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const userId = await getAuthenticatedUserId();

  const { error } = await supabaseAdmin.from('sponsor_store_click_events').insert({
    user_id: userId,
    store_id: storeId,
    source,
    locale,
  });

  if (error) {
    console.error('Failed to record sponsor store click', error);
    return NextResponse.json({ error: 'Unable to record click right now.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
