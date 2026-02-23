import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { collectImageVariantPaths } from '@/lib/storage-public';
import { syncAlgoliaProductById } from '@/lib/services/algolia-products';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const STORAGE_BUCKET = env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const DELETE_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const DELETE_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 20 } as const;
const deleteOriginAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ ok: false, error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const DELETE = withSentryRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, deleteOriginAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`product-delete:ip:${clientIdentifier}`, DELETE_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests from this network. Please try again later.');
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

  const userRate = checkRateLimit(`product-delete:user:${user.id}`, DELETE_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Delete rate limit reached. Please wait and retry.');
  }

  const { id: productId } = await context.params;
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing product id' }, { status: 400 });
  }
  if (!isUuid(productId)) {
    return NextResponse.json({ ok: false, error: 'Invalid product id' }, { status: 400 });
  }

  const { data: product, error: productError } = await supabaseServiceRole
    .from('products')
    .select('id, seller_id, images')
    .eq('id', productId)
    .maybeSingle();

  if (productError) {
    console.error('Failed to load product for deletion', productError);
    return NextResponse.json({ ok: false, error: 'Unable to load listing' }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 });
  }

  const rawImages: unknown[] = Array.isArray((product as { images?: unknown }).images)
    ? ((product as { images?: unknown[] }).images ?? [])
    : [];
  const paths: string[] = Array.from(
    new Set(
      rawImages
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .flatMap((path) => collectImageVariantPaths(path)),
    ),
  );

  let storageWarning: string | null = null;
  if (paths.length > 0) {
    const { error: storageError } = await supabaseServiceRole.storage.from(STORAGE_BUCKET).remove(paths);
    if (storageError) {
      storageWarning = 'Listing images could not be fully removed.';
      console.warn('Failed to remove product images from storage', {
        productId,
        pathsCount: paths.length,
        error: storageError,
      });
    }
  }

  const { error: deleteError } = await supabaseServiceRole.from('products').delete().eq('id', productId).limit(1);

  if (deleteError) {
    console.error('Failed to delete product', deleteError);
    return NextResponse.json({ ok: false, error: 'Unable to delete listing' }, { status: 500 });
  }

  try {
    await syncAlgoliaProductById(productId, supabaseServiceRole);
  } catch (error) {
    console.warn('Algolia sync failed after product deletion', error);
  }

  revalidatePath('/products');
  revalidatePath('/');
  revalidatePath(`/product/${productId}`);
  if (product.seller_id) {
    revalidatePath(`/seller/${product.seller_id}`);
  }

  return NextResponse.json({ ok: true, productId, storageWarning });
}, 'product-delete');
