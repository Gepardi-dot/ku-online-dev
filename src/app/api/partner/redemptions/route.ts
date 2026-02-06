import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { getEnv } from '@/lib/env';

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

const QUERY_SCHEMA = z.object({
  storeId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const LIST_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const LIST_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;

export const GET = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`partner-redemptions:ip:${clientIdentifier}`, LIST_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const url = new URL(request.url);
  const parsed = QUERY_SCHEMA.safeParse({
    storeId: url.searchParams.get('storeId'),
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const { storeId, limit } = parsed.data;
  const boundedLimit = typeof limit === 'number' ? limit : 10;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`partner-redemptions:user:${user.id}`, LIST_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const { data, error } = await supabase
    .from('sponsor_redemptions')
    .select(
      `
      id,
      redeemed_at,
      offer:sponsor_offers (
        id,
        title
      )
    `,
    )
    .eq('store_id', storeId)
    .order('redeemed_at', { ascending: false })
    .limit(boundedLimit);

  if (error) {
    console.error('Failed to load redemptions', error);
    return NextResponse.json({ error: 'Failed to load redemptions' }, { status: 500 });
  }

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    redeemedAt: row.redeemed_at ?? null,
    offerId: row.offer?.id ?? null,
    offerTitle: row.offer?.title ?? null,
  }));

  return NextResponse.json({ ok: true, items });
});

