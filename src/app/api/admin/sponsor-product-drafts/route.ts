import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import {
  COLLAB_DRAFT_DEFAULT_CONDITION,
  COLLAB_DRAFT_DEFAULT_TITLE,
  collabDraftPath,
} from '@/lib/products/collab-draft';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 30 } as const;
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'https://www.kubazar.net',
  'https://kubazar.net',
  'http://localhost:5000',
]);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ ok: false, error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

async function requireModerator(request: NextRequest) {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return { error: NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 }) };
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = await checkRateLimit(`admin-sponsor-product-drafts:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return { error: tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests. Please wait a moment.') };
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return { error: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 }) };
  }

  const userRate = await checkRateLimit(`admin-sponsor-product-drafts:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return { error: tooManyRequestsResponse(userRate.retryAfter, 'Too many requests. Please try again later.') };
  }

  if (!supabaseServiceRole) {
    return { error: NextResponse.json({ ok: false, error: 'Server is not configured.' }, { status: 500 }) };
  }

  return { user, admin: supabaseServiceRole };
}

export const GET = withSentryRoute(async (request: NextRequest) => {
  const auth = await requireModerator(request);
  if ('error' in auth && auth.error) {
    return auth.error;
  }

  const { data, error } = await auth.admin
    .from('products')
    .select(
      `
      id,
      title,
      updated_at,
      seller:users!products_seller_id_fkey(id, email, phone, full_name, name),
      store:sponsor_stores!products_sponsor_store_id_fkey(id, name, slug, status)
    `,
    )
    .eq('is_active', false)
    .eq('is_sold', false)
    .not('sponsor_store_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to list sponsored product drafts', error);
    return NextResponse.json({ ok: false, error: 'Unable to load drafts.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    drafts: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      path: collabDraftPath(row.id),
      updatedAt: row.updated_at,
      seller: row.seller,
      store: row.store,
    })),
  });
});

export const POST = withSentryRoute(async (request: NextRequest) => {
  const auth = await requireModerator(request);
  if ('error' in auth && auth.error) {
    return auth.error;
  }

  const payload = await request.json().catch(() => null);
  const storeId = typeof payload?.storeId === 'string' ? payload.storeId.trim() : '';
  if (!isUuid(storeId)) {
    return NextResponse.json({ ok: false, error: 'Choose a store first.' }, { status: 400 });
  }

  const { data: store, error: storeError } = await auth.admin
    .from('sponsor_stores')
    .select('id, name, slug, status, primary_city, owner_user_id')
    .eq('id', storeId)
    .maybeSingle();

  if (storeError || !store) {
    return NextResponse.json({ ok: false, error: 'Store not found.' }, { status: 404 });
  }

  if (!store.owner_user_id) {
    return NextResponse.json(
      { ok: false, error: 'Set a store owner before creating a product for this store.' },
      { status: 400 },
    );
  }

  const { data, error } = await auth.admin
    .from('products')
    .insert({
      title: COLLAB_DRAFT_DEFAULT_TITLE,
      description: null,
      price: 0,
      currency: 'IQD',
      condition: COLLAB_DRAFT_DEFAULT_CONDITION,
      listing_type: 'sale',
      rental_term: null,
      location: store.primary_city ?? null,
      category_id: null,
      seller_id: store.owner_user_id,
      sponsor_store_id: store.id,
      images: [],
      is_active: false,
      is_promoted: false,
      is_sold: false,
    })
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    console.error('Failed to create sponsored product draft', error);
    return NextResponse.json({ ok: false, error: 'Unable to create draft.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    path: collabDraftPath(data.id),
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
    },
  });
});
