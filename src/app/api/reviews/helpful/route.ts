import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const RATE_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_USER = { windowMs: 60_000, max: 60 } as const;

export const POST = withSentryRoute(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }
  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`helpful:ip:${clientIdentifier}`, RATE_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many actions. Try later.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as { reviewId?: string; action?: 'add' | 'remove' };
  if (!body.reviewId || !body.action) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const userRate = checkRateLimit(`helpful:user:${user.id}`, RATE_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  if (body.action === 'add') {
    const { error } = await supabase.from('review_helpful').insert({ review_id: body.reviewId, user_id: user.id });
    if (error && error.code !== '23505') { // unique violation ok
      return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
    }
  } else {
    await supabase.from('review_helpful').delete().eq('review_id', body.reviewId).eq('user_id', user.id);
  }

  const { data: rows } = await supabase
    .from('review_helpful')
    .select('review_id')
    .eq('review_id', body.reviewId);
  const count = (rows ?? []).length;
  return NextResponse.json({ ok: true, count });
});

