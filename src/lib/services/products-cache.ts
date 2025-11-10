import { unstable_cache } from 'next/cache';
import { createClient as createSupabase } from '@supabase/supabase-js';
import type { MarketplaceCategory } from '@/lib/services/products';

import { getPublicEnv } from '@/lib/env-public';
import { MARKET_CITY_OPTIONS, getMarketCityLabel } from '@/data/market-cities';

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
const supabase = createSupabase(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

function mapCategory(row: any): MarketplaceCategory | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name ?? 'Unnamed',
    nameAr: row.name_ar ?? null,
    nameKu: row.name_ku ?? null,
    description: row.description ?? null,
    icon: row.icon ?? null,
    isActive: row.is_active ?? true,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : row.sort_order ? Number(row.sort_order) : null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

async function fetchPublicCategories(): Promise<MarketplaceCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, name_ar, name_ku, description, icon, is_active, sort_order, created_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to load categories (public)', error);
    return [];
  }

  return (data ?? []).map((row) => mapCategory(row)).filter(Boolean) as MarketplaceCategory[];
}

const CURATED_CITY_LABELS = MARKET_CITY_OPTIONS
  .filter((option) => option.value !== 'all')
  .map((option) => option.label);

async function fetchPublicLocations(limit = 50): Promise<string[]> {
  const ordered = new Map<string, string>();
  CURATED_CITY_LABELS.forEach((label) => ordered.set(label.toLowerCase(), label));

  const { data, error } = await supabase
    .from('products')
    .select('location')
    .not('location', 'is', null)
    .neq('location', '')
    .order('location', { ascending: true })
    .limit(limit);

  if (!error) {
    for (const row of data ?? []) {
      const value = typeof row.location === 'string' ? row.location.trim() : '';
      if (!value) continue;
      const label = getMarketCityLabel(value);
      ordered.set(label.toLowerCase(), label);
    }
  } else {
    console.error('Failed to load locations (public)', error);
  }

  return Array.from(ordered.values());
}

const REVALIDATE_VALUE = process.env.NODE_ENV === 'production' ? 3600 : false;

export const getCachedLocations = unstable_cache(
  () => fetchPublicLocations(50),
  ['locations:list'],
  {
    revalidate: REVALIDATE_VALUE,
    tags: ['locations:list'],
  },
);

export const getCachedCategories = unstable_cache(
  fetchPublicCategories,
  ['categories:list'],
  {
    revalidate: REVALIDATE_VALUE,
    tags: ['categories:list'],
  },
);
