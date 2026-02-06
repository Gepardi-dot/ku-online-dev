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

const OFFER_ID_SCHEMA = z.string().uuid();

const UPDATE_OFFER_SCHEMA = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  terms: z.string().trim().max(4000).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  discountType: z.enum(['percent', 'amount', 'freebie', 'custom']).optional(),
  discountValue: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  originalPrice: z.union([z.number(), z.string()]).nullable().optional(),
  dealPrice: z.union([z.number(), z.string()]).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'expired', 'archived']).optional(),
  isFeatured: z.boolean().optional(),
  maxClaimsPerUser: z.number().int().min(1).max(50).optional(),
  maxRedemptionsPerUser: z.number().int().min(1).max(50).optional(),
  maxTotalRedemptions: z.number().int().min(1).max(100000).nullable().optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 360 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 360 } as const;

export const PATCH = withSentryRoute(async (request: Request, ctx: { params: Promise<{ offerId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-offers:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawOfferId = (await ctx.params).offerId;
  const parsedOfferId = OFFER_ID_SCHEMA.safeParse(rawOfferId);
  if (!parsedOfferId.success) {
    return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 });
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

  const userRate = checkRateLimit(`admin-sponsor-offers:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_OFFER_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const update: Record<string, unknown> = {};
  if (payload.title !== undefined) update.title = payload.title;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.terms !== undefined) update.terms = payload.terms;
  if (payload.startAt !== undefined) update.start_at = payload.startAt;
  if (payload.endAt !== undefined) update.end_at = payload.endAt;
  if (payload.discountType !== undefined) update.discount_type = payload.discountType;
  if (payload.discountValue !== undefined) update.discount_value = payload.discountValue;
  if (payload.currency !== undefined) update.currency = payload.currency;
  if (payload.originalPrice !== undefined) update.original_price = payload.originalPrice;
  if (payload.dealPrice !== undefined) update.deal_price = payload.dealPrice;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.isFeatured !== undefined) update.is_featured = payload.isFeatured;
  if (payload.maxClaimsPerUser !== undefined) update.max_claims_per_user = payload.maxClaimsPerUser;
  if (payload.maxRedemptionsPerUser !== undefined) update.max_redemptions_per_user = payload.maxRedemptionsPerUser;
  if (payload.maxTotalRedemptions !== undefined) update.max_total_redemptions = payload.maxTotalRedemptions;

  const { data, error } = await supabase.from('sponsor_offers').update(update).eq('id', parsedOfferId.data).select('id').single();

  if (error) {
    console.error('Failed to update sponsor offer', error);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, offer: { id: data.id } });
}, 'admin-sponsor-offers-update');
