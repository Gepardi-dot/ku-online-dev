import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
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

const STORE_ID_SCHEMA = z.string().uuid();

const CREATE_OFFER_SCHEMA = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  terms: z.string().trim().max(4000).optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  discountType: z.enum(['percent', 'amount', 'freebie', 'custom']).optional(),
  discountValue: z.union([z.number(), z.string()]).optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  originalPrice: z.union([z.number(), z.string()]).optional().nullable(),
  dealPrice: z.union([z.number(), z.string()]).optional().nullable(),
  status: z.enum(['draft', 'active', 'paused', 'expired', 'archived']).optional(),
  isFeatured: z.boolean().optional(),
  maxClaimsPerUser: z.number().int().min(1).max(50).optional(),
  maxRedemptionsPerUser: z.number().int().min(1).max(50).optional(),
  maxTotalRedemptions: z.number().int().min(1).max(100000).optional().nullable(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 240 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 240 } as const;

export const POST = withSentryRoute(async (request: Request, ctx: { params: Promise<{ storeId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-offers:create:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawStoreId = (await ctx.params).storeId;
  const parsedStoreId = STORE_ID_SCHEMA.safeParse(rawStoreId);
  if (!parsedStoreId.success) {
    return NextResponse.json({ error: 'Invalid store id' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isModerator(user)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const userRate = checkRateLimit(`admin-sponsor-offers:create:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = CREATE_OFFER_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from('sponsor_offers')
    .insert({
      store_id: parsedStoreId.data,
      title: payload.title,
      description: payload.description ?? null,
      terms: payload.terms ?? null,
      end_at: payload.endAt ?? null,
      discount_type: payload.discountType ?? 'custom',
      discount_value: payload.discountValue ?? null,
      currency: payload.currency ?? null,
      original_price: payload.originalPrice ?? null,
      deal_price: payload.dealPrice ?? null,
      status: payload.status ?? 'active',
      is_featured: payload.isFeatured ?? false,
      max_claims_per_user: payload.maxClaimsPerUser ?? 1,
      max_redemptions_per_user: payload.maxRedemptionsPerUser ?? 1,
      max_total_redemptions: payload.maxTotalRedemptions ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create sponsor offer', error);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, offer: { id: data.id } });
}, 'admin-sponsor-offers-create');
