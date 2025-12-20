import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();

const supabaseAdmin = createSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SOLD_NOTIFICATION_TITLE = 'Listing you saved was sold';

const SOLD_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 20 } as const;
const SOLD_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;

const soldOriginAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function revalidateListing(productId: string) {
  revalidatePath(`/product/${productId}`);
  revalidatePath('/watchlist');
}

export const POST = withSentryRoute(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, soldOriginAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sold:ip:${clientIdentifier}`, SOLD_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests from this network. Please try again later.');
    }
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`sold:user:${userId}`, SOLD_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Rate limit reached. Please wait before trying again.');
  }

  const { id: productId } = await context.params;
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const isSold = payload?.isSold;
  if (typeof isSold !== 'boolean') {
    return NextResponse.json({ error: 'isSold must be a boolean' }, { status: 400 });
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, seller_id, title, is_sold')
    .eq('id', productId)
    .maybeSingle();

  if (productError) {
    console.error('Failed to load product for sold toggle', productError);
    return NextResponse.json({ error: 'Unable to load listing' }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (product.seller_id !== userId) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const previousSold = Boolean(product.is_sold);

  const { data: updatedProduct, error: updateError } = await supabaseAdmin
    .from('products')
    .update({ is_sold: isSold })
    .eq('id', productId)
    .eq('seller_id', userId)
    .eq('is_sold', !isSold)
    .select('id, is_sold')
    .maybeSingle();

  if (updateError) {
    console.error('Failed to update product sold status', updateError);
    return NextResponse.json({ error: 'Unable to update listing' }, { status: 500 });
  }

  let effectiveSold = updatedProduct ? Boolean(updatedProduct.is_sold) : previousSold;
  if (!updatedProduct && effectiveSold !== isSold) {
    const { data: currentProduct, error: currentError } = await supabaseAdmin
      .from('products')
      .select('is_sold')
      .eq('id', productId)
      .maybeSingle();

    if (currentError) {
      console.error('Failed to refresh product sold state after update noop', currentError);
    } else if (currentProduct) {
      effectiveSold = Boolean(currentProduct.is_sold);
    }
  }

  // If the update did not transition state, do not emit notifications.
  const didTransitionToSold = isSold && !previousSold && effectiveSold;

  let notifiedCount = 0;
  let notificationWarning: string | null = null;

  if (didTransitionToSold) {
    try {
      const { data: favoritesRows, error: favoritesError } = await supabaseAdmin
        .from('favorites')
        .select('user_id')
        .eq('product_id', productId);

      if (favoritesError) {
        throw favoritesError;
      }

      const watcherIds = Array.from(
        new Set(
          (favoritesRows ?? [])
            .map((row) => row.user_id as string | null)
            .filter((id): id is string => Boolean(id) && id !== userId),
        ),
      );

      if (watcherIds.length > 0) {
        const { data: preferenceRows, error: preferenceError } = await supabaseAdmin
          .from('users')
          .select('id, notify_updates')
          .in('id', watcherIds);

        if (preferenceError) {
          throw preferenceError;
        }

        const allowedIds = (preferenceRows ?? [])
          .filter((row) => row.notify_updates !== false)
          .map((row) => row.id as string);

        if (allowedIds.length > 0) {
          const { data: existingRows, error: existingError } = await supabaseAdmin
            .from('notifications')
            .select('user_id')
            .eq('type', 'listing')
            .eq('related_id', productId)
            .eq('title', SOLD_NOTIFICATION_TITLE)
            .in('user_id', allowedIds);

          if (existingError) {
            throw existingError;
          }

          const existingSet = new Set((existingRows ?? []).map((row) => row.user_id as string));
          const toInsert = allowedIds.filter((id) => !existingSet.has(id));

          if (toInsert.length > 0) {
            const rows = toInsert.map((targetUserId) => ({
              user_id: targetUserId,
              title: SOLD_NOTIFICATION_TITLE,
              content: (product.title as string | null) ?? '',
              type: 'listing',
              related_id: productId,
              is_read: false,
            }));

            const { error: insertError } = await supabaseAdmin.from('notifications').insert(rows);
            if (insertError) {
              throw insertError;
            }

            notifiedCount = rows.length;
          }
        }
      }
    } catch (error) {
      notificationWarning = 'Sold notifications could not be delivered to all watchers.';
      console.error('Failed to emit sold notifications', { productId, error });
    }
  }

  revalidateListing(productId);

  return NextResponse.json({
    success: true,
    isSold: effectiveSold,
    notifiedCount,
    notificationWarning,
  });
});
