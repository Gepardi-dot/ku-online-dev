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

const UPDATE_SCHEMA = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only letters, numbers, and hyphens')
    .optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  logoUrl: z.string().trim().max(1024).nullable().optional(),
  coverUrl: z.string().trim().max(1024).nullable().optional(),
  primaryCity: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(512).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  sponsorTier: z.enum(['basic', 'featured']).optional(),
  isFeatured: z.boolean().optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 240 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 240 } as const;

export const PATCH = withSentryRoute(async (request: Request, ctx: { params: Promise<{ storeId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-stores:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
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

  const userRate = checkRateLimit(`admin-sponsor-stores:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const update: Record<string, unknown> = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.slug !== undefined) update.slug = payload.slug;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.logoUrl !== undefined) update.logo_url = payload.logoUrl;
  if (payload.coverUrl !== undefined) update.cover_url = payload.coverUrl;
  if (payload.primaryCity !== undefined) update.primary_city = payload.primaryCity;
  if (payload.phone !== undefined) update.phone = payload.phone;
  if (payload.whatsapp !== undefined) update.whatsapp = payload.whatsapp;
  if (payload.website !== undefined) update.website = payload.website;
  if (payload.ownerUserId !== undefined) update.owner_user_id = payload.ownerUserId;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.sponsorTier !== undefined) update.sponsor_tier = payload.sponsorTier;
  if (payload.isFeatured !== undefined) update.is_featured = payload.isFeatured;

  const { data, error } = await supabase.from('sponsor_stores').update(update).eq('id', parsedStoreId.data).select('id').single();

  if (error) {
    console.error('Failed to update sponsor store', error);
    const isUnique = typeof error.message === 'string' && error.message.toLowerCase().includes('unique');
    return NextResponse.json({ error: isUnique ? 'Slug already exists' : 'Failed to update store' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, store: { id: data.id } });
}, 'admin-sponsor-stores-update');
