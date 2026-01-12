import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { collectImageVariantPaths } from '@/lib/storage-public';
import { syncAlgoliaProductById } from '@/lib/services/algolia-products';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const STORAGE_BUCKET = env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

export const DELETE = withSentryRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
  }

  const { id: productId } = await context.params;
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing product id' }, { status: 400 });
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
