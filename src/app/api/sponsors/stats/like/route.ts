import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function tooManyRequestsResponse(retryAfter: number) {
  const response = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-store-like:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter);
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`sponsor-store-like:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter);
  }

  const payload = (await request.json().catch(() => null)) as { storeId?: unknown; like?: unknown } | null;
  const storeId = typeof payload?.storeId === 'string' ? payload.storeId.trim() : '';
  const like = payload?.like;

  if (!storeId || !isUuid(storeId) || typeof like !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  if (like) {
    const { error } = await supabase.from('sponsor_store_likes').insert({
      store_id: storeId,
      user_id: user.id,
    });

    if (error && error.code !== '23505') {
      console.error('Failed to like sponsor store', error);
      return NextResponse.json({ ok: false, error: 'Failed to update like.' }, { status: 400 });
    }
  } else {
    const { error } = await supabase
      .from('sponsor_store_likes')
      .delete()
      .eq('store_id', storeId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to unlike sponsor store', error);
      return NextResponse.json({ ok: false, error: 'Failed to update like.' }, { status: 400 });
    }
  }

  const { data: statsRow, error: statsError } = await supabase
    .from('sponsor_store_live_stats')
    .select('total_likes')
    .eq('store_id', storeId)
    .maybeSingle();

  if (statsError) {
    console.error('Failed to load sponsor store like stats', statsError);
  }

  const totalLikesRaw = statsRow?.total_likes;
  const totalLikes = typeof totalLikesRaw === 'number' ? totalLikesRaw : Number(totalLikesRaw ?? 0) || 0;

  return NextResponse.json({ ok: true, liked: like, totalLikes: Math.max(0, totalLikes) });
}, 'sponsor-store-like');
