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

const POST_RATE_IP = { windowMs: 60_000, max: 60 } as const;
const POST_RATE_USER = { windowMs: 60_000, max: 10 } as const;

export const GET = withSentryRoute(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const sellerId = searchParams.get('sellerId');
  const productId = searchParams.get('productId');
  const limit = Math.min(Number(searchParams.get('limit') || '10'), 50);
  const offset = Math.max(Number(searchParams.get('offset') || '0'), 0);

  if (!sellerId && !productId) {
    return NextResponse.json({ error: 'sellerId or productId required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  let query = supabase
    .from('reviews')
    .select('id, rating, comment, is_anonymous, created_at, buyer_id, buyer:buyer_id(full_name, avatar_url)')
    .order('created_at', { ascending: false });

  if (sellerId) query = query.eq('seller_id', sellerId);
  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const itemsRaw = (data ?? []) as any[];
  const ids = itemsRaw.map((r) => r.id).filter(Boolean);

  // Helpful counts
  let helpfulMap = new Map<string, number>();
  if (ids.length) {
    const { data: hRows } = await supabase
      .from('review_helpful')
      .select('review_id')
      .in('review_id', ids);
    helpfulMap = (hRows ?? []).reduce((acc, row: any) => {
      const id = String(row.review_id);
      acc.set(id, (acc.get(id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  // Voted-by-me flags
  let votedSet = new Set<string>();
  const { data: userData } = await supabase.auth.getUser();
  const me = userData?.user?.id ?? null;
  if (me && ids.length) {
    const { data: myRows } = await supabase
      .from('review_helpful')
      .select('review_id')
      .eq('user_id', me)
      .in('review_id', ids);
    votedSet = new Set((myRows ?? []).map((r: any) => String(r.review_id)));
  }

  const items = itemsRaw.map((row: any) => ({
    id: String(row.id),
    rating: Number(row.rating),
    comment: (row.comment as string) ?? '',
    isAnonymous: Boolean(row.is_anonymous),
    createdAt: String(row.created_at),
    buyerName: row?.buyer?.full_name ?? 'Buyer',
    buyerAvatar: row?.buyer?.avatar_url ?? null,
    buyerId: row?.buyer_id ? String(row.buyer_id) : undefined,
    helpfulCount: helpfulMap.get(String(row.id)) ?? 0,
    votedByMe: votedSet.has(String(row.id)),
  }));

  // Aggregate
  let aggQ = supabase.from('reviews').select('rating', { count: 'exact' as const, head: true });
  if (sellerId) aggQ = aggQ.eq('seller_id', sellerId);
  if (productId) aggQ = aggQ.eq('product_id', productId);
  const { count } = await aggQ;
  const avg = items.length ? items.reduce((a, b) => a + b.rating, 0) / (items.length) : 0;

  return NextResponse.json({ items, total: count ?? items.length, average: avg });
});

export const POST = withSentryRoute(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`reviews:ip:${clientIdentifier}`, POST_RATE_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many submissions. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    sellerId?: string;
    productId?: string | null;
    rating?: number;
    comment?: string;
    isAnonymous?: boolean;
  };
  const rating = Number(body.rating);
  if (!body.sellerId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`reviews:user:${user.id}`, POST_RATE_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'You have reached the review rate limit.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const payload = {
    seller_id: body.sellerId,
    buyer_id: user.id,
    product_id: body.productId ?? null,
    rating,
    comment: (body.comment ?? '').trim() || null,
    is_anonymous: Boolean(body.isAnonymous),
  };

  const { data, error } = await supabase
    .from('reviews')
    .insert(payload)
    .select('id, rating, comment, is_anonymous, created_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 });
  }

  // Trigger function will recalculate seller rating
  return NextResponse.json({ ok: true, review: data });
});

export const PATCH = withSentryRoute(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    rating?: number;
    comment?: string | null;
    isAnonymous?: boolean;
  };
  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const update: any = {};
  if (typeof body.rating === 'number') {
    if (body.rating < 1 || body.rating > 5) return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    update.rating = body.rating;
  }
  if (body.comment !== undefined) update.comment = (body.comment ?? '').trim() || null;
  if (body.isAnonymous !== undefined) update.is_anonymous = Boolean(body.isAnonymous);

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data, error } = await supabase
    .from('reviews')
    .update(update)
    .eq('id', body.id)
    .select('id');
  if (error) return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
  return NextResponse.json({ ok: true });
});
