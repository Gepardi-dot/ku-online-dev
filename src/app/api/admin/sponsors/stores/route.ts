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

const CREATE_SCHEMA = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only letters, numbers, and hyphens'),
  description: z.string().trim().max(4000).optional().nullable(),
  logoUrl: z.string().trim().max(1024).optional().nullable(),
  coverUrl: z.string().trim().max(1024).optional().nullable(),
  primaryCity: z.string().trim().max(40).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  website: z.string().trim().max(512).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  sponsorTier: z.enum(['basic', 'featured']).optional(),
  isFeatured: z.boolean().optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-stores:create:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
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

  if (authError || !user || !isModerator(user)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const userRate = checkRateLimit(`admin-sponsor-stores:create:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = CREATE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from('sponsor_stores')
    .insert({
      name: payload.name,
      slug: payload.slug,
      description: payload.description ?? null,
      logo_url: payload.logoUrl ?? null,
      cover_url: payload.coverUrl ?? null,
      primary_city: payload.primaryCity ?? null,
      phone: payload.phone ?? null,
      whatsapp: payload.whatsapp ?? null,
      website: payload.website ?? null,
      owner_user_id: payload.ownerUserId ?? null,
      status: payload.status ?? 'pending',
      sponsor_tier: payload.sponsorTier ?? 'basic',
      is_featured: payload.isFeatured ?? false,
    })
    .select('id,slug')
    .single();

  if (error) {
    console.error('Failed to create sponsor store', error);
    const isUnique = typeof error.message === 'string' && error.message.toLowerCase().includes('unique');
    return NextResponse.json({ error: isUnique ? 'Slug already exists' : 'Failed to create store' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, store: { id: data.id, slug: data.slug } });
}, 'admin-sponsor-stores-create');
