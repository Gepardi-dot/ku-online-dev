import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/lib/auth/roles';
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

const OFFER_ID_SCHEMA = z.string().uuid();
const STORE_ID_SCHEMA = z.string().uuid();

const UPDATE_SERVICE_SCHEMA = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  discountType: z.enum(['percent', 'amount', 'freebie', 'custom']).optional(),
  discountValue: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 360 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 360 } as const;

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

async function getStoreById(storeId: string): Promise<StoreRow | null> {
  const { data, error } = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, owner_user_id')
    .eq('id', storeId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data as StoreRow;
}

async function canUserManageStore(userId: string, storeId: string): Promise<boolean> {
  if (!userId || !storeId) return false;

  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (!ownerRes.error && ownerRes.data?.id) {
    return true;
  }

  const staffRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('store_id')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'manager')
    .maybeSingle();

  return !staffRes.error && Boolean(staffRes.data?.store_id);
}

function parseRequestedStoreId(request: Request): string | null {
  const raw = new URL(request.url).searchParams.get('storeId') ?? '';
  const parsed = STORE_ID_SCHEMA.safeParse(raw.trim());
  return parsed.success ? parsed.data : null;
}

async function ensureOfferBelongsToStore(offerId: string, storeId: string) {
  const { data, error } = await supabaseAdmin
    .from('sponsor_offers')
    .select('id, store_id')
    .eq('id', offerId)
    .maybeSingle();

  if (error) {
    console.error('Failed to check offer ownership', error);
    return { ok: false as const, status: 400, error: 'Failed to verify offer.' };
  }

  if (!data?.id || data.store_id !== storeId) {
    return { ok: false as const, status: 404, error: 'Offer not found.' };
  }

  return { ok: true as const };
}

export const PATCH = withSentryRoute(async (request: Request, ctx: { params: Promise<{ offerId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-services:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ ok: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawOfferId = (await ctx.params).offerId;
  const parsedOfferId = OFFER_ID_SCHEMA.safeParse(rawOfferId);
  if (!parsedOfferId.success) {
    return NextResponse.json({ ok: false, error: 'Invalid offer id' }, { status: 400 });
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

  const requestedStoreId = parseRequestedStoreId(request);
  if (requestedStoreId && !isAdmin(user)) {
    const hasAccess = await canUserManageStore(user.id, requestedStoreId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
    }
  }

  const userRate = checkRateLimit(`sponsor-services:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const store = requestedStoreId ? await getStoreById(requestedStoreId) : await getStoreForUser(user.id);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'No sponsor store found for this account.' }, { status: 404 });
  }

  const ownership = await ensureOfferBelongsToStore(parsedOfferId.data, store.id);
  if (!ownership.ok) {
    return NextResponse.json({ ok: false, error: ownership.error }, { status: ownership.status });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_SERVICE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const update: Record<string, unknown> = {};
  if (payload.title !== undefined) update.title = payload.title;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.discountType !== undefined) update.discount_type = payload.discountType;
  if (payload.discountValue !== undefined) update.discount_value = payload.discountValue;
  if (payload.currency !== undefined) update.currency = payload.currency;
  if (payload.endAt !== undefined) update.end_at = payload.endAt;
  if (payload.status !== undefined) update.status = payload.status;

  const { data, error } = await supabaseAdmin
    .from('sponsor_offers')
    .update(update)
    .eq('id', parsedOfferId.data)
    .select('id, title, description, discount_type, discount_value, currency, end_at, status')
    .single();

  if (error) {
    console.error('Failed to update sponsor service', error);
    return NextResponse.json({ ok: false, error: 'Failed to update service.' }, { status: 400 });
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
}, 'sponsor-services-update');

export const DELETE = withSentryRoute(async (request: Request, ctx: { params: Promise<{ offerId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-services:delete:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ ok: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawOfferId = (await ctx.params).offerId;
  const parsedOfferId = OFFER_ID_SCHEMA.safeParse(rawOfferId);
  if (!parsedOfferId.success) {
    return NextResponse.json({ ok: false, error: 'Invalid offer id' }, { status: 400 });
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

  const requestedStoreId = parseRequestedStoreId(request);
  if (requestedStoreId && !isAdmin(user)) {
    const hasAccess = await canUserManageStore(user.id, requestedStoreId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
    }
  }

  const userRate = checkRateLimit(`sponsor-services:delete:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const store = requestedStoreId ? await getStoreById(requestedStoreId) : await getStoreForUser(user.id);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'No sponsor store found for this account.' }, { status: 404 });
  }

  const ownership = await ensureOfferBelongsToStore(parsedOfferId.data, store.id);
  if (!ownership.ok) {
    return NextResponse.json({ ok: false, error: ownership.error }, { status: ownership.status });
  }

  const { error } = await supabaseAdmin.from('sponsor_offers').delete().eq('id', parsedOfferId.data);
  if (error) {
    console.error('Failed to delete sponsor service', error);
    return NextResponse.json({ ok: false, error: 'Failed to delete service.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}, 'sponsor-services-delete');
