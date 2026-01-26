'use client';

import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { signStoragePaths } from '@/lib/services/storage-sign-client';

const supabase = createClient();
const FAVORITES_CACHE_TTL_MS = 60_000;
const FAVORITES_CACHE_KEY = 'favorites:list:';

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

type FavoritesCacheEntry = {
  items: FavoriteSummary[];
  count: number;
  cachedAt: number;
  expiresAt: number;
};

const favoritesCache = new Map<string, FavoritesCacheEntry>();
const favoritesInFlight = new Map<string, Promise<FavoritesCacheEntry>>();

function normalizeLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) return 24;
  return Math.min(Math.max(Math.floor(limit), 1), 60);
}

function normalizeTtl(ttlMs?: number): number {
  if (!ttlMs || !Number.isFinite(ttlMs)) return FAVORITES_CACHE_TTL_MS;
  return Math.min(Math.max(ttlMs, 5_000), 5 * 60_000);
}

function cacheKey(userId: string, limit: number): string {
  return `${userId}:${normalizeLimit(limit)}`;
}

function storageKey(userId: string, limit: number): string {
  return `${FAVORITES_CACHE_KEY}${cacheKey(userId, limit)}`;
}

function readSessionEntry(userId: string, limit: number): FavoritesCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(storageKey(userId, limit));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FavoritesCacheEntry | null;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (typeof parsed.count !== 'number') return null;
    if (typeof parsed.expiresAt !== 'number' || typeof parsed.cachedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionEntry(userId: string, limit: number, entry: FavoritesCacheEntry) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(storageKey(userId, limit), JSON.stringify(entry));
  } catch {
    // ignore storage failures
  }
}

export function getCachedFavorites(
  userId: string,
  limit?: number,
  ttlMs?: number,
): { items: FavoriteSummary[]; count: number } | null {
  const now = Date.now();
  const normalizedLimit = normalizeLimit(limit);
  const ttl = normalizeTtl(ttlMs);
  const key = cacheKey(userId, normalizedLimit);
  const isFresh = (entry: FavoritesCacheEntry | null | undefined): entry is FavoritesCacheEntry =>
    entry != null && entry.cachedAt + ttl > now;

  const inMemory = favoritesCache.get(key);
  if (isFresh(inMemory)) {
    return { items: inMemory.items, count: inMemory.count };
  }

  const sessionEntry = readSessionEntry(userId, normalizedLimit);
  if (isFresh(sessionEntry)) {
    favoritesCache.set(key, sessionEntry);
    return { items: sessionEntry.items, count: sessionEntry.count };
  }

  if (inMemory && !isFresh(inMemory)) {
    favoritesCache.delete(key);
  }
  if (sessionEntry && !isFresh(sessionEntry) && typeof window !== 'undefined') {
    try {
      window.sessionStorage?.removeItem(storageKey(userId, normalizedLimit));
    } catch {
      // ignore
    }
  }

  return null;
}

function setCachedFavorites(
  userId: string,
  limit: number,
  entry: { items: FavoriteSummary[]; count: number },
  ttlMs?: number,
) {
  const normalizedLimit = normalizeLimit(limit);
  const ttl = normalizeTtl(ttlMs);
  const now = Date.now();
  const cacheEntry: FavoritesCacheEntry = {
    items: entry.items,
    count: entry.count,
    cachedAt: now,
    expiresAt: now + ttl,
  };
  const key = cacheKey(userId, normalizedLimit);
  favoritesCache.set(key, cacheEntry);
  writeSessionEntry(userId, normalizedLimit, cacheEntry);
}

export function cacheFavoritesForUser(
  userId: string,
  limit: number,
  entry: { items: FavoriteSummary[]; count: number },
  ttlMs?: number,
) {
  if (!userId) return;
  setCachedFavorites(userId, limit, entry, ttlMs);
}

export function updateCachedFavorites(
  userId: string,
  limit: number,
  updater: (current: { items: FavoriteSummary[]; count: number }) => { items: FavoriteSummary[]; count: number },
  ttlMs?: number,
): { items: FavoriteSummary[]; count: number } {
  const cached = getCachedFavorites(userId, limit, ttlMs) ?? { items: [], count: 0 };
  const next = updater(cached);
  setCachedFavorites(userId, limit, next, ttlMs);
  return next;
}

function mapFavoriteRow(row: any): FavoriteSummary {
  const imagesValue = Array.isArray(row?.product?.images)
    ? row.product.images
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 1)
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
          imageUrls: [],
          location: (row.product.location as string) ?? null,
        }
      : null,
  };
}

async function hydrateFavoriteImages(favorites: FavoriteSummary[]) {
  const paths = Array.from(
    new Set(
      favorites.flatMap((favorite) => {
        const images = favorite.product?.imagePaths ?? [];
        return images.slice(0, 1);
      }),
    ),
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
        .slice(0, 1)
        .map((path) => map[path])
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
      favorite.product.imageUrls = urls;
    });
  } catch (error) {
    console.error('Failed to hydrate favorite images', error);
  }
}

async function fetchFavoritesFromSupabase(userId: string, limit: number): Promise<FavoritesCacheEntry> {
  const normalizedLimit = normalizeLimit(limit);
  const { data, count, error } = await supabase
    .from('favorites')
    .select(
      `id, product_id, user_id, created_at,
       product:products!favorites_product_id_fkey(
         id, title, price, currency, images, location
       )`,
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    throw error;
  }

  const items = (data ?? []).map((row) => mapFavoriteRow(row));
  await hydrateFavoriteImages(items);
  return {
    items,
    count: typeof count === 'number' ? count : items.length,
    cachedAt: Date.now(),
    expiresAt: Date.now(),
  };
}

async function refreshFavorites(userId: string, limit: number, ttlMs?: number): Promise<FavoritesCacheEntry> {
  const normalizedLimit = normalizeLimit(limit);
  const key = cacheKey(userId, normalizedLimit);
  const existing = favoritesInFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const entry = await fetchFavoritesFromSupabase(userId, normalizedLimit);
    setCachedFavorites(userId, normalizedLimit, { items: entry.items, count: entry.count }, ttlMs);
    return {
      ...entry,
      cachedAt: Date.now(),
      expiresAt: Date.now() + normalizeTtl(ttlMs),
    };
  })().finally(() => {
    favoritesInFlight.delete(key);
  });

  favoritesInFlight.set(key, promise);
  return promise;
}

export async function listFavoritesWithOptions(
  userId: string,
  limit = 24,
  options?: { preferCache?: boolean; backgroundRefresh?: boolean; cacheTtlMs?: number },
): Promise<{ items: FavoriteSummary[]; count: number }> {
  const normalizedLimit = normalizeLimit(limit);
  const preferCache = options?.preferCache !== false;
  const cached = preferCache ? getCachedFavorites(userId, normalizedLimit, options?.cacheTtlMs) : null;

  if (cached && options?.backgroundRefresh) {
    void refreshFavorites(userId, normalizedLimit, options?.cacheTtlMs);
    return cached;
  }

  const fresh = await refreshFavorites(userId, normalizedLimit, options?.cacheTtlMs);
  if (fresh.items.length === 0 && cached) {
    return cached;
  }
  return { items: fresh.items, count: fresh.count };
}

export function prefetchFavoritesForUser(userId: string, limit = 24, ttlMs?: number) {
  const normalizedLimit = normalizeLimit(limit);
  const cached = getCachedFavorites(userId, normalizedLimit, ttlMs);
  if (cached) return;
  void refreshFavorites(userId, normalizedLimit, ttlMs);
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
  const result = await listFavoritesWithOptions(userId, limit, { preferCache: false });
  return result.items;
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
