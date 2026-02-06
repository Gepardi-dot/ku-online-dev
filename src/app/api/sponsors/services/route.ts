import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

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
const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const CREATE_SERVICE_SCHEMA = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  discountType: z.enum(['percent', 'amount', 'freebie', 'custom']).optional(),
  discountValue: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 240 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 240 } as const;

type StoreRow = { id: string; name: string | null; slug: string | null; owner_user_id: string | null };

async function getStoreForUser(userId: string): Promise<StoreRow | null> {
  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, owner_user_id')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ownerRes.error && ownerRes.data?.id) return ownerRes.data as StoreRow;

  const staffRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('store_id, role, status, sponsor_stores ( id, name, slug, owner_user_id )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();

  const store = (staffRes.data as any)?.sponsor_stores as StoreRow | null | undefined;
  return store?.id ? store : null;
}

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

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const store = await getStoreForUser(user.id);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'No sponsor store found for this account.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('sponsor_offers')
    .select('id, title, description, discount_type, discount_value, currency, end_at, status, created_at, updated_at')
    .eq('store_id', store.id)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to list sponsor services', error);
    return NextResponse.json({ ok: false, error: 'Failed to load services.' }, { status: 400 });
  }

  const offers = (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? null,
    discountType: row.discount_type ?? 'custom',
    discountValue: row.discount_value ?? null,
    currency: row.currency ?? null,
    endAt: row.end_at ?? null,
    status: row.status ?? 'active',
  }));

  return NextResponse.json({
    ok: true,
    store: { id: store.id, name: store.name ?? 'Store', slug: store.slug ?? store.id },
    offers,
  });
}, 'sponsor-services-list');

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-services:create:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
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

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const userRate = checkRateLimit(`sponsor-services:create:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const store = await getStoreForUser(user.id);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'No sponsor store found for this account.' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = CREATE_SERVICE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const insert = {
    store_id: store.id,
    title: payload.title,
    description: payload.description ?? null,
    discount_type: payload.discountType ?? 'custom',
    discount_value: payload.discountValue ?? null,
    currency: payload.currency ?? null,
    end_at: payload.endAt ?? null,
    status: payload.status ?? 'active',
  };

  const { data, error } = await supabaseAdmin
    .from('sponsor_offers')
    .insert(insert)
    .select('id, title, description, discount_type, discount_value, currency, end_at, status')
    .single();

  if (error) {
    console.error('Failed to create sponsor service', error);
    return NextResponse.json({ ok: false, error: 'Failed to create service.' }, { status: 400 });
  }

  const offer = {
    id: data.id,
    title: data.title ?? '',
    description: data.description ?? null,
    discountType: data.discount_type ?? 'custom',
    discountValue: data.discount_value ?? null,
    currency: data.currency ?? null,
    endAt: data.end_at ?? null,
    status: data.status ?? 'active',
  };

  return NextResponse.json({ ok: true, offer });
}, 'sponsor-services-create');

