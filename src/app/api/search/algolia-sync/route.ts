import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { fetchAlgoliaProductRow, syncAlgoliaProductRow } from '@/lib/services/algolia-products';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseAdmin = createSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SYNC_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 30 } as const;
const SYNC_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;

const syncOriginAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const POST = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, syncOriginAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`algolia-sync:ip:${clientIdentifier}`, SYNC_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests from this network. Please try again later.');
    }
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`algolia-sync:user:${user.id}`, SYNC_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Rate limit reached. Please wait before trying again.');
  }

  const payload = await request.json().catch(() => null);
  const productId = typeof payload?.productId === 'string' ? payload.productId : null;
  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const { row, error } = await fetchAlgoliaProductRow(productId, supabaseAdmin);
  if (error) {
    return NextResponse.json({ error: 'Unable to sync listing right now.' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (row.seller_id !== user.id && !isModerator(user)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const ok = await syncAlgoliaProductRow(row);
  return NextResponse.json({ ok, productId });
});
