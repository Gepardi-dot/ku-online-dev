import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@supabase/supabase-js';
import { syncAlgoliaProductById } from '@/lib/services/algolia-products';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

const { ADMIN_REVALIDATE_TOKEN, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
  getEnv();
const supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const runtime = 'nodejs';

const MODERATE_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const MODERATE_RATE_LIMIT_PER_TOKEN = { windowMs: 60_000, max: 30 } as const;

const adminModerateOriginAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

function tooManyRequestsResponse(retryAfter: number) {
  const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const POST = withSentryRoute(async (req: NextRequest) => {
  const originHeader = req.headers.get('origin');
  if (
    originHeader &&
    !isOriginAllowed(originHeader, adminModerateOriginAllowList) &&
    !isSameOriginRequest(req)
  ) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(req.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-moderate:ip:${clientIdentifier}`, MODERATE_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter);
    }
  }

  const token = req.headers.get('x-admin-token') ?? '';
  if (!ADMIN_REVALIDATE_TOKEN || token !== ADMIN_REVALIDATE_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokenRate = checkRateLimit('admin-moderate:token', MODERATE_RATE_LIMIT_PER_TOKEN);
  if (!tokenRate.success) {
    return tooManyRequestsResponse(tokenRate.retryAfter);
  }

  const body = (await req.json().catch(() => ({}))) as { productId?: string; active?: boolean };
  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const active = typeof body.active === 'boolean' ? body.active : false;

  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  if (!isUuid(productId)) {
    return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('products')
    .update({ is_active: active })
    .eq('id', productId)
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  try {
    await syncAlgoliaProductById(productId, supabaseAdmin);
  } catch (syncError) {
    console.warn('Algolia sync failed after moderation update', syncError);
  }

  return NextResponse.json({ ok: true, productId, is_active: active });
});
