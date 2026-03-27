import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { type AlgoliaProductRow, syncAlgoliaProductRow } from '@/lib/services/algolia-products';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();

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

async function getAuthenticatedContext() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user ?? null };
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const POST = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, syncOriginAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`algolia-sync:ip:${clientIdentifier}`, SYNC_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests from this network. Please try again later.');
    }
  }

  const { supabase, user } = await getAuthenticatedContext();
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

  const { data, error } = await supabase.rpc('get_algolia_product_row_secure', {
    p_product_id: productId,
  });

  if (error) {
    const code = (error.code ?? '').toUpperCase();
    const message = (error.message ?? '').toLowerCase();
    if (code === '28000' || message.includes('not_authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (code === '42501' || message.includes('forbidden')) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
    if (code === '22P02' || message.includes('invalid input syntax for type uuid')) {
      return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
    }

    console.error('Failed to load product for Algolia sync', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: 'Unable to sync listing right now.' }, { status: 500 });
  }

  const row = (data as AlgoliaProductRow | null) ?? null;
  if (!row) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const ok = await syncAlgoliaProductRow(row);
  return NextResponse.json({ ok, productId });
});
