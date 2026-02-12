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
import { buildPublicStorageUrl, isAllowedProductImageInput } from '@/lib/storage-public';

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

const UPDATE_STORE_CARD_SCHEMA = z.object({
  coverUrl: z.string().trim().max(1024).nullable(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;

type StoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  owner_user_id: string | null;
  cover_url: string | null;
};

async function getStoreForUser(userId: string): Promise<StoreRow | null> {
  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, owner_user_id, cover_url')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ownerRes.error && ownerRes.data?.id) {
    return ownerRes.data as StoreRow;
  }

  const staffRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('store_id, role, status, sponsor_stores ( id, name, slug, owner_user_id, cover_url )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();

  const store = (staffRes.data as any)?.sponsor_stores as StoreRow | null | undefined;
  return store?.id ? store : null;
}

function normalizeStoreCoverUrl(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (normalized.startsWith('/') || /^https?:\/\//i.test(normalized)) return normalized;
  return buildPublicStorageUrl(normalized) ?? normalized;
}

export const PATCH = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-store:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
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

  const userRate = checkRateLimit(`sponsor-store:update:user:${user.id}`, RATE_LIMIT_PER_USER);
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
  const parsed = UPDATE_STORE_CARD_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const coverCandidate = parsed.data.coverUrl?.trim() ?? '';
  const coverUrl = coverCandidate.length ? coverCandidate : null;

  if (coverUrl && !isAllowedProductImageInput(coverUrl)) {
    return NextResponse.json({ ok: false, error: 'Image must be a Supabase storage image.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('sponsor_stores')
    .update({ cover_url: coverUrl })
    .eq('id', store.id)
    .select('id, name, slug, cover_url')
    .single();

  if (error) {
    console.error('Failed to update sponsor store card image', error);
    return NextResponse.json({ ok: false, error: 'Failed to update store.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    store: {
      id: data.id,
      name: data.name ?? 'Store',
      slug: data.slug ?? data.id,
      coverUrl: normalizeStoreCoverUrl(data.cover_url),
    },
  });
}, 'sponsor-store-update');
