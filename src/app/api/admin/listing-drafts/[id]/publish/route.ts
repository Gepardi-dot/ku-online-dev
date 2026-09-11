import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { createProductSchema } from '@/lib/validation/schemas';
import { syncAlgoliaProductById } from '@/lib/services/algolia-products';
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

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 30 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 20 } as const;
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

export const POST = withSentryRoute(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = await checkRateLimit(`admin-listing-publish:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests. Please wait a moment.');
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
  }

  const userRate = await checkRateLimit(`admin-listing-publish:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Too many requests. Please try again later.');
  }

  if (!supabaseServiceRole) {
    return NextResponse.json({ ok: false, error: 'Server is not configured.' }, { status: 500 });
  }

  const { id: productId } = await context.params;
  if (!productId || !isUuid(productId)) {
    return NextResponse.json({ ok: false, error: 'Invalid listing.' }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const featured = payload?.featured === true;

  const { data: product, error: loadError } = await supabaseServiceRole
    .from('products')
    .select(
      'id, title, description, price, currency, condition, listing_type, rental_term, location, category_id, seller_id, images, is_active, is_sold',
    )
    .eq('id', productId)
    .maybeSingle();

  if (loadError || !product) {
    return NextResponse.json({ ok: false, error: 'Draft not found.' }, { status: 404 });
  }

  if (product.is_sold) {
    return NextResponse.json({ ok: false, error: 'This listing is already sold.' }, { status: 409 });
  }

  const { data: category } = product.category_id
    ? await supabaseServiceRole.from('categories').select('name').eq('id', product.category_id).maybeSingle()
    : { data: null };

  const validation = createProductSchema.safeParse({
    title: product.title,
    description: product.description ?? '',
    price: product.price,
    currency: product.currency === 'USD' ? 'USD' : 'IQD',
    condition: product.condition ?? '',
    categoryId: product.category_id ?? '',
    categoryName: category?.name ?? null,
    listingType: product.listing_type,
    rentalTerm: product.rental_term,
    location: product.location ?? '',
    images: Array.isArray(product.images) ? product.images : [],
    sellerId: product.seller_id,
  });

  if (!validation.success) {
    const issue = validation.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? 'Finish the listing before publishing.' },
      { status: 400 },
    );
  }

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await supabaseServiceRole
    .from('products')
    .update({
      is_active: true,
      is_promoted: featured,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId);

  if (updateError) {
    console.error('Failed to publish listing draft', updateError);
    return NextResponse.json({ ok: false, error: 'Unable to publish listing.' }, { status: 500 });
  }

  await syncAlgoliaProductById(productId, supabaseServiceRole).catch((error) => {
    console.warn('Algolia sync failed after publish', error);
  });

  try {
    fetch(`${env.NEXT_PUBLIC_SITE_URL ?? ''}/api/products/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    }).catch(() => {});
  } catch {}

  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath(`/product/${productId}`);
  if (product.seller_id) {
    revalidatePath(`/seller/${product.seller_id}`);
  }

  return NextResponse.json({
    ok: true,
    id: productId,
    featured,
    path: `/product/${productId}`,
  });
});
