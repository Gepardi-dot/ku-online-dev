import 'server-only';

import { algoliasearch, type Algoliasearch } from 'algoliasearch';
import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeMarketCityValue } from '@/data/market-cities';
import { getEnv } from '@/lib/env';
import { deriveThumbPath } from '@/lib/storage-public';

type AlgoliaCategoryRow = {
  id: string;
  name: string | null;
  name_ar: string | null;
  name_ku: string | null;
} | null;

type AlgoliaSellerRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
} | null;

export type AlgoliaProductRow = {
  id: string;
  title: string | null;
  description: string | null;
  price: number | string | null;
  original_price?: number | string | null;
  currency: string | null;
  condition: string | null;
  color_token?: string | null;
  category_id: string | null;
  seller_id: string | null;
  location: string | null;
  images: string[] | null;
  is_active: boolean | null;
  is_sold: boolean | null;
  is_promoted: boolean | null;
  views: number | string | null;
  created_at: string | null;
  expires_at?: string | null;
  updated_at: string | null;
  category?: AlgoliaCategoryRow;
  seller?: AlgoliaSellerRow;
};

type AlgoliaProductRecord = {
  objectID: string;
  id: string;
  title: string;
  description: string;
  price: number;
  original_price?: number | null;
  currency: string | null;
  condition: string | null;
  color_token?: string | null;
  category_id: string | null;
  category_name: string | null;
  category_name_ar: string | null;
  category_name_ku: string | null;
  seller_id: string | null;
  seller_full_name: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_avatar: string | null;
  seller_is_verified: boolean;
  location: string | null;
  location_normalized: string | null;
  images: string[];
  image_thumb_path: string | null;
  is_active: boolean;
  is_sold: boolean;
  is_promoted: boolean;
  views: number;
  created_at: string | null;
  created_at_ts: number | null;
  expires_at_ts: number | null;
  updated_at: string | null;
  search_text: string;
};

let algoliaClient: Algoliasearch | null = null;
let algoliaUnavailable = false;
let algoliaIndexName: string | null = null;

function getAlgoliaAdminClient(): { client: Algoliasearch; indexName: string } | null {
  if (algoliaClient && algoliaIndexName) {
    return { client: algoliaClient, indexName: algoliaIndexName };
  }

  if (algoliaUnavailable) {
    return null;
  }

  try {
    const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, ALGOLIA_INDEX_NAME } = getEnv();
    if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY || !ALGOLIA_INDEX_NAME) {
      algoliaUnavailable = true;
      return null;
    }

    algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
    algoliaIndexName = ALGOLIA_INDEX_NAME;
    return { client: algoliaClient, indexName: ALGOLIA_INDEX_NAME };
  } catch (error) {
    console.warn('Algolia admin client unavailable', error);
    algoliaUnavailable = true;
    return null;
  }
}

function normalizeSearchText(value: string): string {
  const stripped = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return stripped
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0643/g, '\u06A9')
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u06CC');
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  const raw = parts
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim();

  if (!raw) {
    return '';
  }

  const normalized = normalizeSearchText(raw);
  if (!normalized || normalized === raw) {
    return raw;
  }

  return `${raw} ${normalized}`;
}

function normalizeLocation(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeMarketCityValue(value);
  if (normalized) {
    return normalized;
  }

  const fallback = value.trim().toLowerCase();
  return fallback.length > 0 ? fallback : null;
}

function parseNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseOptionalNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = parseNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type AlgoliaProductFetchResult = {
  row: AlgoliaProductRow | null;
  error?: string;
};

export async function fetchAlgoliaProductRow(
  productId: string,
  supabaseAdmin: SupabaseClient,
): Promise<AlgoliaProductFetchResult> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(
      `
        id,
        title,
        description,
        price,
        original_price,
        currency,
        condition,
        color_token,
        category_id,
        seller_id,
        location,
        images,
        is_active,
        is_sold,
        is_promoted,
        views,
        created_at,
        expires_at,
        updated_at,
        category:categories(
          id,
          name,
          name_ar,
          name_ku
        ),
        seller:users(
          id,
          email,
          full_name,
          name,
          avatar_url,
          is_verified
        )
      `,
    )
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load product for Algolia sync', error);
    return { row: null, error: error.message };
  }

  return { row: (data as AlgoliaProductRow | null) ?? null };
}

function toAlgoliaProductRecord(row: AlgoliaProductRow): AlgoliaProductRecord {
  const title = row.title ?? '';
  const description = row.description ?? '';
  const category = row.category ?? null;
  const seller = row.seller ?? null;
  const imagePaths = Array.isArray(row.images) ? row.images : [];
  const primaryImage = imagePaths[0] ?? null;
  const imageThumbPath = primaryImage ? deriveThumbPath(primaryImage) : null;
  const createdAtTs = toTimestamp(row.created_at);
  const expiresAtTs =
    toTimestamp(row.expires_at ?? null) ??
    (createdAtTs ? createdAtTs + 90 * 24 * 60 * 60 * 1000 : null);

  return {
    objectID: row.id,
    id: row.id,
    title,
    description,
    price: parseNumber(row.price, 0),
    original_price: parseOptionalNumber(row.original_price),
    currency: row.currency ?? null,
    condition: row.condition ?? null,
    color_token: row.color_token ?? null,
    category_id: row.category_id ?? null,
    category_name: category?.name ?? null,
    category_name_ar: category?.name_ar ?? null,
    category_name_ku: category?.name_ku ?? null,
    seller_id: row.seller_id ?? null,
    seller_full_name: seller?.full_name ?? null,
    seller_name: seller?.name ?? null,
    seller_email: seller?.email ?? null,
    seller_avatar: seller?.avatar_url ?? null,
    seller_is_verified: Boolean(seller?.is_verified),
    location: row.location ?? null,
    location_normalized: normalizeLocation(row.location),
    images: imagePaths,
    image_thumb_path: imageThumbPath,
    is_active: row.is_active ?? true,
    is_sold: row.is_sold ?? false,
    is_promoted: row.is_promoted ?? false,
    views: parseNumber(row.views, 0),
    created_at: row.created_at ?? null,
    created_at_ts: createdAtTs,
    expires_at_ts: expiresAtTs,
    updated_at: row.updated_at ?? null,
    search_text: buildSearchText([
      title,
      description,
      row.location ?? '',
      category?.name ?? '',
      category?.name_ar ?? '',
      category?.name_ku ?? '',
    ]),
  };
}

export async function syncAlgoliaProductRow(row: AlgoliaProductRow): Promise<boolean> {
  const clientConfig = getAlgoliaAdminClient();
  if (!clientConfig) {
    return false;
  }

  const { client, indexName } = clientConfig;
  const record = toAlgoliaProductRecord(row);

  try {
    await client.saveObjects({
      indexName,
      objects: [record],
      waitForTasks: false,
    });
    return true;
  } catch (error) {
    console.error('Algolia product sync failed', error);
    return false;
  }
}

export async function removeAlgoliaProduct(productId: string): Promise<boolean> {
  const clientConfig = getAlgoliaAdminClient();
  if (!clientConfig) {
    return false;
  }

  const { client, indexName } = clientConfig;

  try {
    await client.deleteObjects({
      indexName,
      objectIDs: [productId],
      waitForTasks: false,
    });
    return true;
  } catch (error) {
    console.error('Algolia product removal failed', error);
    return false;
  }
}

export async function syncAlgoliaProductById(
  productId: string,
  supabaseAdmin: SupabaseClient,
): Promise<boolean> {
  const result = await fetchAlgoliaProductRow(productId, supabaseAdmin);
  if (result.error) {
    return false;
  }
  if (!result.row) {
    return removeAlgoliaProduct(productId);
  }

  return syncAlgoliaProductRow(result.row);
}
