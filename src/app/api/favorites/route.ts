import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { addFavorite, removeFavorite, MOCK_FAVORITES_COOKIE } from '@/lib/services/favorites';

import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

async function getAuthenticatedUserId() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

const env = getEnv();

const FAVORITES_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 40 } as const;
const FAVORITES_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 80 } as const;

const favoritesOriginAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function revalidateWatchlist() {
  revalidatePath('/watchlist');
}

async function persistMockFavoritesCookie(mockFavorites?: Record<string, string[]>) {
  if (!mockFavorites) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(MOCK_FAVORITES_COOKIE, JSON.stringify(mockFavorites), {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    sameSite: 'lax',
  });
}

export const POST = withSentryRoute(async (request: Request) => {
  try {
    const originHeader = request.headers.get('origin');
    if (
      originHeader &&
      !isOriginAllowed(originHeader, favoritesOriginAllowList) &&
      !isSameOriginRequest(request)
    ) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
    }

    const clientIdentifier = getClientIdentifier(request.headers);
    if (clientIdentifier !== 'unknown') {
      const ipRate = checkRateLimit(`favorites:ip:${clientIdentifier}`, FAVORITES_RATE_LIMIT_PER_IP);
      if (!ipRate.success) {
        return tooManyRequestsResponse(ipRate.retryAfter, 'Too many favorite operations from this network. Please try again later.');
      }
    }

    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userRate = checkRateLimit(`favorites:user:${userId}`, FAVORITES_RATE_LIMIT_PER_USER);
    if (!userRate.success) {
      return tooManyRequestsResponse(userRate.retryAfter, 'Favorite rate limit reached. Please wait before trying again.');
    }

    const { productId } = await request.json();

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const result = await addFavorite(userId, productId);

    if (!result.success) {
      return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
    }

    await persistMockFavoritesCookie(result.mockFavorites);
    revalidateWatchlist();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding favorite', error);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
});

export const DELETE = withSentryRoute(async (request: Request) => {
  try {
    const originHeader = request.headers.get('origin');
    if (
      originHeader &&
      !isOriginAllowed(originHeader, favoritesOriginAllowList) &&
      !isSameOriginRequest(request)
    ) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
    }

    const clientIdentifier = getClientIdentifier(request.headers);
    if (clientIdentifier !== 'unknown') {
      const ipRate = checkRateLimit(`favorites:ip:${clientIdentifier}`, FAVORITES_RATE_LIMIT_PER_IP);
      if (!ipRate.success) {
        return tooManyRequestsResponse(ipRate.retryAfter, 'Too many favorite operations from this network. Please try again later.');
      }
    }

    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userRate = checkRateLimit(`favorites:user:${userId}`, FAVORITES_RATE_LIMIT_PER_USER);
    if (!userRate.success) {
      return tooManyRequestsResponse(userRate.retryAfter, 'Favorite rate limit reached. Please wait before trying again.');
    }

    const { productId } = await request.json();

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const result = await removeFavorite(userId, productId);

    if (!result.success) {
      return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
    }

    await persistMockFavoritesCookie(result.mockFavorites);
    revalidateWatchlist();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing favorite', error);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
});
