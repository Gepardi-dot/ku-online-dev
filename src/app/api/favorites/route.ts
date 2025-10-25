import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { addFavorite, removeFavorite, MOCK_FAVORITES_COOKIE } from '@/lib/services/favorites';

async function getAuthenticatedUserId() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
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

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
}

export async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
}
