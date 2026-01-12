'use client';

import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env-public';
import { signStoragePaths } from '@/lib/services/storage-sign-client';

const supabase = createClient();
const { NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET } = getPublicEnv();
const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

export interface FavoriteSummary {
  id: string;
  productId: string;
  userId: string;
  createdAt: string;
  product?: {
    id: string;
    title: string;
    price: number | null;
    currency: string | null;
    imagePaths: string[];
    imageUrls: string[];
    location: string | null;
  } | null;
}

function mapFavoriteRow(row: any): FavoriteSummary {
  const imagesValue = Array.isArray(row?.product?.images)
    ? row.product.images.filter((item: unknown): item is string => typeof item === 'string')
    : [];

  const priceValue =
    typeof row?.product?.price === 'number'
      ? row.product.price
      : row?.product?.price
      ? Number(row.product.price)
      : null;

  return {
    id: row.id as string,
    productId: row.product_id as string,
    userId: row.user_id as string,
    createdAt: row.created_at as string,
    product: row.product
      ? {
          id: row.product.id as string,
          title: (row.product.title as string) ?? 'Untitled',
          price: priceValue,
          currency: (row.product.currency as string) ?? 'IQD',
          imagePaths: imagesValue,
          imageUrls: imagesValue,
          location: (row.product.location as string) ?? null,
        }
      : null,
  };
}

async function hydrateFavoriteImages(favorites: FavoriteSummary[]) {
  const paths = Array.from(
    new Set(favorites.flatMap((favorite) => favorite.product?.imagePaths ?? [])),
  ).filter(Boolean);

  if (!paths.length) {
    return;
  }

  try {
    const map = await signStoragePaths(paths, {
      transform: { width: 96, resize: 'cover', quality: 70, format: 'webp' },
    });

    favorites.forEach((favorite) => {
      if (!favorite.product) return;
      const urls = favorite.product.imagePaths
        .map((path) => map[path])
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
      favorite.product.imageUrls = urls;
    });
  } catch (error) {
    console.error('Failed to hydrate favorite images', error);
  }
}

export async function fetchFavoriteStatus(userId: string, productId: string) {
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return {
    favoriteId: data?.id ?? null,
    isFavorited: Boolean(data?.id),
  };
}

export async function addFavorite(userId: string, productId: string) {
  const { data, error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, product_id: productId })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

export async function removeFavorite(favoriteId: string, userId: string) {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('id', favoriteId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function listFavorites(userId: string, limit = 24): Promise<FavoriteSummary[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(
      `id, product_id, user_id, created_at,
       product:products!favorites_product_id_fkey(
         id, title, price, currency, images, location
       )`
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const favorites = (data ?? []).map((row) => mapFavoriteRow(row));
  await hydrateFavoriteImages(favorites);
  return favorites;
}

export async function countFavorites(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('favorites')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export function subscribeToFavorites(
  userId: string,
  handler: (payload: { type: 'INSERT' | 'DELETE' | 'UPDATE'; favoriteId: string; productId: string }) => void,
): RealtimeChannel {
  return supabase
    .channel(`favorites-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'favorites',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const record = (payload.new ?? payload.old) as { id: string; product_id: string };
        if (record?.id) {
          handler({
            type: payload.eventType as 'INSERT' | 'DELETE' | 'UPDATE',
            favoriteId: record.id,
            productId: record.product_id,
          });
        }
      },
    )
    .subscribe();
}
