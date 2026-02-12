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

const UPDATE_STORE_SCHEMA = z.object({
  coverUrl: z.string().trim().max(1024).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(512).nullable().optional(),
  directionsUrl: z.string().trim().max(512).nullable().optional(),
});
const STORE_ID_SCHEMA = z.string().uuid();

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;

type StoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  owner_user_id: string | null;
  cover_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
};

async function getStoreForUser(userId: string): Promise<StoreRow | null> {
  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, owner_user_id, cover_url, phone, whatsapp, website')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ownerRes.error && ownerRes.data?.id) {
    return ownerRes.data as StoreRow;
  }

  const staffRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('store_id, role, status, sponsor_stores ( id, name, slug, owner_user_id, cover_url, phone, whatsapp, website )')
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
    .select('id, name, slug, owner_user_id, cover_url, phone, whatsapp, website')
    .eq('id', storeId)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

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
  const url = new URL(request.url);
  const raw = (url.searchParams.get('storeId') ?? '').trim();
  if (!raw) return null;
  const parsed = STORE_ID_SCHEMA.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function promoteThumbToFull(value: string): string {
  if (!value.includes('-thumb.')) return value;

  if (!/^https?:\/\//i.test(value)) {
    return value.replace('-thumb.', '-full.');
  }

  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace('-thumb.', '-full.');
    return url.toString();
  } catch {
    return value.replace('-thumb.', '-full.');
  }
}

function normalizeStoreCoverUrl(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  const canonical = promoteThumbToFull(normalized);
  if (canonical.startsWith('/') || /^https?:\/\//i.test(canonical)) return canonical;
  return buildPublicStorageUrl(canonical) ?? canonical;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

async function getPrimaryDirectionsUrl(storeId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('sponsor_store_locations')
    .select('address, is_primary, updated_at')
    .eq('store_id', storeId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const code = typeof error.code === 'string' ? error.code : '';
    if (code === '42P01' || code === 'PGRST205') {
      return null;
    }
    console.error('Failed to load sponsor store primary location', error);
    return null;
  }

  return normalizeNullable((data as { address?: string | null } | null)?.address ?? null);
}

async function upsertPrimaryDirectionsUrl(storeId: string, directionsUrl: string | null): Promise<void> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('sponsor_store_locations')
    .select('id, is_primary')
    .eq('store_id', storeId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    const code = typeof fetchError.code === 'string' ? fetchError.code : '';
    if (code === '42P01' || code === 'PGRST205') {
      return;
    }
    throw fetchError;
  }

  if (!existing?.id) {
    if (!directionsUrl) return;

    const { error: insertError } = await supabaseAdmin.from('sponsor_store_locations').insert({
      store_id: storeId,
      address: directionsUrl,
      is_primary: true,
    });
    if (insertError) {
      throw insertError;
    }
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('sponsor_store_locations')
    .update({
      address: directionsUrl,
      is_primary: true,
    })
    .eq('id', existing.id);

  if (updateError) {
    throw updateError;
  }
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

  const requestedStoreId = parseRequestedStoreId(request);
  if (requestedStoreId && !isAdmin(user)) {
    const hasAccess = await canUserManageStore(user.id, requestedStoreId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
    }
  }

  const userRate = checkRateLimit(`sponsor-store:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const store = requestedStoreId ? await getStoreById(requestedStoreId) : await getStoreForUser(user.id);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'No sponsor store found for this account.' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_STORE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const hasCoverUrl = Object.prototype.hasOwnProperty.call(parsed.data, 'coverUrl');
  const hasPhone = Object.prototype.hasOwnProperty.call(parsed.data, 'phone');
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(parsed.data, 'whatsapp');
  const hasWebsite = Object.prototype.hasOwnProperty.call(parsed.data, 'website');
  const hasDirectionsUrl = Object.prototype.hasOwnProperty.call(parsed.data, 'directionsUrl');

  if (!hasCoverUrl && !hasPhone && !hasWhatsapp && !hasWebsite && !hasDirectionsUrl) {
    return NextResponse.json({ ok: false, error: 'No changes provided.' }, { status: 400 });
  }

  const coverUrl = normalizeNullable(parsed.data.coverUrl);
  const canonicalCoverUrl = coverUrl ? promoteThumbToFull(coverUrl) : null;
  const phone = normalizeNullable(parsed.data.phone);
  const whatsapp = normalizeNullable(parsed.data.whatsapp);
  const website = normalizeNullable(parsed.data.website);
  const directionsUrl = normalizeNullable(parsed.data.directionsUrl);

  if (hasCoverUrl && canonicalCoverUrl && !isAllowedProductImageInput(canonicalCoverUrl)) {
    return NextResponse.json({ ok: false, error: 'Image must be a Supabase storage image.' }, { status: 400 });
  }

  const updatePayload: Record<string, string | null> = {};
  if (hasCoverUrl) updatePayload.cover_url = canonicalCoverUrl;
  if (hasPhone) updatePayload.phone = phone;
  if (hasWhatsapp) updatePayload.whatsapp = whatsapp;
  if (hasWebsite) updatePayload.website = website;

  let updatedStore: StoreRow = store;
  if (Object.keys(updatePayload).length > 0) {
    const { data, error } = await supabaseAdmin
      .from('sponsor_stores')
      .update(updatePayload)
      .eq('id', store.id)
      .select('id, name, slug, owner_user_id, cover_url, phone, whatsapp, website')
      .single();

    if (error) {
      console.error('Failed to update sponsor store', error);
      return NextResponse.json({ ok: false, error: 'Failed to update store.' }, { status: 400 });
    }
    updatedStore = data as StoreRow;
  }

  if (hasDirectionsUrl) {
    try {
      await upsertPrimaryDirectionsUrl(store.id, directionsUrl);
    } catch (error) {
      console.error('Failed to update sponsor store directions link', error);
      return NextResponse.json({ ok: false, error: 'Failed to update store directions.' }, { status: 400 });
    }
  }

  const resolvedDirectionsUrl = hasDirectionsUrl ? directionsUrl : await getPrimaryDirectionsUrl(store.id);

  return NextResponse.json({
    ok: true,
    store: {
      id: updatedStore.id,
      name: updatedStore.name ?? 'Store',
      slug: updatedStore.slug ?? updatedStore.id,
      coverUrl: normalizeStoreCoverUrl(updatedStore.cover_url),
      phone: normalizeNullable(updatedStore.phone),
      whatsapp: normalizeNullable(updatedStore.whatsapp),
      website: normalizeNullable(updatedStore.website),
      directionsUrl: normalizeNullable(resolvedDirectionsUrl),
    },
  });
}, 'sponsor-store-update');

export const DELETE = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-store:delete:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
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

  if (authError || !user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const userRate = checkRateLimit(`sponsor-store:delete:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const requestedStoreId = parseRequestedStoreId(request);
  if (!requestedStoreId) {
    return NextResponse.json({ ok: false, error: 'A valid storeId is required.' }, { status: 400 });
  }

  const store = await getStoreById(requestedStoreId);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'Store not found.' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('sponsor_stores').delete().eq('id', store.id);
  if (error) {
    console.error('Failed to delete sponsor store', error);
    return NextResponse.json({ ok: false, error: 'Failed to remove store.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deletedStoreId: store.id });
}, 'sponsor-store-delete');
