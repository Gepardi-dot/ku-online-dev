import { cookies } from "next/headers";
import { algoliasearch, type Algoliasearch } from "algoliasearch";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createSignedUrls, createTransformedSignedUrls } from '@/lib/storage';
import { assertAllowedProductImagePaths, buildPublicStorageUrl, deriveThumbPath, isAllowedProductImageInput } from '@/lib/storage-public';
import { DEFAULT_MARKET_CITIES, MARKET_CITY_OPTIONS, getMarketCityLabel, normalizeMarketCityValue } from '@/data/market-cities';
import { getEnv } from "@/lib/env";

export interface SellerProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  name: string | null;
  avatar: string | null;
  location: string | null;
  bio: string | null;
  isVerified: boolean;
  rating: number | null;
  totalRatings: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  nameAr: string | null;
  nameKu: string | null;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: Date | null;
}

export interface ProductWithRelations {
  id: string;
  title: string;
  description: string | null;
  titleTranslations?: Record<string, string> | null;
  descriptionTranslations?: Record<string, string> | null;
  price: number;
  currency: string | null;
  condition: string | null;
  colorToken?: string | null;
  categoryId: string | null;
  sellerId: string;
  location: string | null;
  imagePaths: string[];
  imageUrls: string[];
  isActive: boolean;
  isSold: boolean;
  isPromoted: boolean;
  views: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  seller: SellerProfile | null;
  category?: MarketplaceCategory | null;
  originalPrice?: number;
}

export interface ProductMetadata {
  id: string;
  title: string;
  description: string | null;
  titleTranslations?: Record<string, string> | null;
  descriptionTranslations?: Record<string, string> | null;
  imageUrls: string[];
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'views_desc';

export interface ProductFilters {
  category?: string;
  condition?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  search?: string;
  sellerId?: string;
  sort?: ProductSort;
  createdAfter?: string;
  freeOnly?: boolean;
  includeInactive?: boolean;
  includeSold?: boolean;
}

export const PRODUCT_SELECT = `*,
       seller:users!products_seller_id_fkey(
         id,
         email,
         phone,
         full_name,
         name,
         avatar_url,
         location,
         bio,
         is_verified,
         rating,
         total_ratings,
         created_at,
         updated_at
       ),
       category:categories!products_category_id_fkey(
         id,
         name,
         name_ar,
         name_ku,
         description,
         icon,
         is_active,
         sort_order,
         created_at
       )`;

export type SupabaseProductRow = {
  id: string;
  title: string;
  description: string | null;
  title_translations?: Record<string, unknown> | null;
  description_translations?: Record<string, unknown> | null;
  i18n_source_hash?: string | null;
  i18n_updated_at?: string | null;
  price: number | string | null;
  original_price?: number | string | null;
  currency: string | null;
  condition: string | null;
  color_token?: string | null;
  category_id: string | null;
  seller_id: string;
  location: string | null;
  images: string[] | null;
  is_active: boolean | null;
  is_sold: boolean | null;
  is_promoted: boolean | null;
  views: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  seller: any;
  category: any;
};

type SupabaseCategoryRow = {
  id: string;
  name: string;
  name_ar: string | null;
  name_ku: string | null;
  description: string | null;
  icon: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
};

type SupabaseLocationRow = {
  location: string | null;
};

type SupabaseProductMetadataRow = {
  id: string;
  title: string;
  description: string | null;
  title_translations?: Record<string, unknown> | null;
  description_translations?: Record<string, unknown> | null;
  images: string[] | null;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item) => isAllowedProductImageInput(item));
  }
  return [];
}

function normalizeTranslationMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function resolvePublicImageUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const thumbPath = deriveThumbPath(path);
  return buildPublicStorageUrl(thumbPath);
}

function hydrateProductPublicImages(products: ProductWithRelations[]): void {
  for (const product of products) {
    const urls = product.imagePaths
      .map((path) => resolvePublicImageUrl(path))
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
    product.imageUrls = urls;
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function mapSeller(row: any | null): SellerProfile | null {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email ?? null,
    phone: row.phone ?? null,
    fullName: row.full_name ?? row.fullName ?? null,
    name: row.name ?? row.full_name ?? row.fullName ?? null,
    avatar: row.avatar_url ?? row.avatar ?? null,
    location: row.location ?? null,
    bio: row.bio ?? null,
    isVerified: Boolean(row.is_verified),
    rating: typeof row.rating === "number" ? row.rating : row.rating ? Number(row.rating) : null,
    totalRatings: typeof row.total_ratings === "number" ? row.total_ratings : row.total_ratings ? Number(row.total_ratings) : null,
    createdAt: toDate(row.created_at ?? null),
    updatedAt: toDate(row.updated_at ?? null),
  };
}

function mapCategory(row: SupabaseCategoryRow | null): MarketplaceCategory | null {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name ?? "Unnamed",
    nameAr: row.name_ar ?? null,
    nameKu: row.name_ku ?? null,
    description: row.description ?? null,
    icon: row.icon ?? null,
    isActive: row.is_active ?? true,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : row.sort_order ? Number(row.sort_order) : null,
    createdAt: toDate(row.created_at ?? null),
  };
}

export function mapProduct(row: SupabaseProductRow): ProductWithRelations {
  const originalPrice =
    typeof row.original_price === "number"
      ? row.original_price
      : typeof row.original_price === "string" && row.original_price.trim() !== ""
      ? Number(row.original_price)
      : undefined;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    titleTranslations: normalizeTranslationMap(row.title_translations),
    descriptionTranslations: normalizeTranslationMap(row.description_translations),
    price: typeof row.price === "number" ? row.price : row.price ? Number(row.price) : 0,
    currency: row.currency ?? "IQD",
    condition: row.condition,
    colorToken: row.color_token ?? null,
    categoryId: row.category_id,
    sellerId: row.seller_id,
    location: row.location,
    imagePaths: normalizeImages(row.images),
    imageUrls: normalizeImages(row.images),
    isActive: row.is_active ?? true,
    isSold: row.is_sold ?? false,
    isPromoted: row.is_promoted ?? false,
    views: typeof row.views === "number" ? row.views : row.views ? Number(row.views) : 0,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    seller: mapSeller(row.seller ?? null),
    category: mapCategory(row.category ?? null),
    originalPrice,
  };
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

let supabaseAdmin: ReturnType<typeof createSupabaseAdmin> | null = null;
let supabaseAdminUnavailable = false;

async function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }
  if (supabaseAdminUnavailable) {
    return null;
  }

  try {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
    supabaseAdmin = createSupabaseAdmin(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch (error) {
    console.warn("Service role Supabase client unavailable", error);
    supabaseAdminUnavailable = true;
  }

  return supabaseAdmin;
}

let algoliaClient: Algoliasearch | null = null;
let algoliaUnavailable = false;
let algoliaIndexName: string | null = null;

function getAlgoliaClient(): Algoliasearch | null {
  if (algoliaClient) {
    return algoliaClient;
  }
  if (algoliaUnavailable) {
    return null;
  }

  try {
    const { ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY, ALGOLIA_INDEX_NAME } = process.env;
    if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_API_KEY || !ALGOLIA_INDEX_NAME) {
      algoliaUnavailable = true;
      return null;
    }

    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY);
    algoliaClient = client;
    algoliaIndexName = ALGOLIA_INDEX_NAME;
    return algoliaClient;
  } catch (error) {
    console.warn("Algolia search unavailable", error);
    algoliaUnavailable = true;
    return null;
  }
}

async function hydrateSellerProfiles(products: ProductWithRelations[]): Promise<void> {
  const missingIds = Array.from(
    new Set(
      products
        .filter((product) => {
          const seller = product.seller;
          const hasDisplayName = Boolean(seller && (seller.fullName || seller.name || seller.email));
          return !hasDisplayName && product.sellerId;
        })
        .map((product) => product.sellerId),
    ),
  );

  if (!missingIds.length) {
    return;
  }

  const adminClient = await getSupabaseAdmin();
  if (!adminClient) {
    return;
  }

  const { data, error } = await adminClient
    .from('users')
    .select('id, email, phone, full_name, name, avatar_url, location, bio, is_verified, rating, total_ratings, created_at, updated_at')
    .in('id', missingIds);

  if (error) {
    console.error('Failed to hydrate seller profiles', error);
    return;
  }

  const sellerMap = new Map<string, SellerProfile>();
  for (const row of data ?? []) {
    const mapped = mapSeller(row);
    if (mapped) {
      sellerMap.set(mapped.id, mapped);
    }
  }

  for (const product of products) {
    const hasDisplayName = Boolean(product.seller && (product.seller.fullName || product.seller.name || product.seller.email));
    if (!hasDisplayName) {
      const hydrated = sellerMap.get(product.sellerId);
      if (hydrated) {
        product.seller = hydrated;
      }
    }
  }
}

function buildProductsQuery(supabase: any, filters: ProductFilters = {}, options: { withCount?: boolean } = {}) {
  let query = options.withCount
    ? supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' as const })
    : supabase.from('products').select(PRODUCT_SELECT);

  const includeInactive = Boolean(filters.includeInactive);
  const includeSold = Boolean(filters.includeSold);
  query = query.not('seller_id', 'is', null);
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  if (!includeSold) {
    query = query.eq('is_sold', false);
  }
  query = query.gt('expires_at', new Date().toISOString());

  if (filters.category) {
    query = query.eq('category_id', filters.category);
  }

  const condition = filters.condition?.trim();
  if (condition) {
    query = query.ilike('condition', condition);
  }

  if (filters.location) {
    const locationTerm = `%${filters.location}%`;
    query = query.ilike('location', locationTerm);
  }

  if (filters.color) {
    query = query.eq('color_token', filters.color);
  }

  if (filters.freeOnly) {
    // Treat "free" listings as those with price exactly 0
    query = query.eq('price', 0);
  }

  if (typeof filters.minPrice === 'number') {
    query = query.gte('price', filters.minPrice);
  }

  if (typeof filters.maxPrice === 'number') {
    query = query.lte('price', filters.maxPrice);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.ilike('title', term);
  }

  if (filters.sellerId) {
    query = query.eq('seller_id', filters.sellerId);
  }

  if (filters.createdAfter) {
    query = query.gte('created_at', filters.createdAfter);
  }

  return query;
}

function applyProductsSort(query: any, sort: ProductSort) {
  switch (sort) {
    case 'price_asc':
      return query.order('price', { ascending: true, nullsLast: true });
    case 'price_desc':
      return query.order('price', { ascending: false, nullsLast: true });
    case 'views_desc':
      return query.order('views', { ascending: false, nullsLast: true });
    case 'newest':
    default:
      return query.order('created_at', { ascending: false, nullsLast: true });
  }
}

function sortProductsInMemory(items: ProductWithRelations[], sort: ProductSort) {
  switch (sort) {
    case 'price_asc':
      return [...items].sort((a, b) => a.price - b.price);
    case 'price_desc':
      return [...items].sort((a, b) => b.price - a.price);
    case 'views_desc':
      return [...items].sort((a, b) => b.views - a.views);
    case 'newest':
    default:
      return items;
  }
}

type AlgoliaSearchHit = {
  objectID?: string;
  id?: string;
  title?: string;
  description?: string | null;
  title_i18n_en?: string | null;
  title_i18n_ar?: string | null;
  title_i18n_ku?: string | null;
  title_i18n_ku_latn?: string | null;
  description_i18n_en?: string | null;
  description_i18n_ar?: string | null;
  description_i18n_ku?: string | null;
  description_i18n_ku_latn?: string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  currency?: string | null;
  condition?: string | null;
  color_token?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_name_ar?: string | null;
  category_name_ku?: string | null;
  seller_id?: string | null;
  seller_full_name?: string | null;
  seller_name?: string | null;
  seller_email?: string | null;
  seller_avatar?: string | null;
  seller_is_verified?: boolean | null;
  location?: string | null;
  images?: string[] | null;
  image_thumb_path?: string | null;
  is_active?: boolean | null;
  is_sold?: boolean | null;
  is_promoted?: boolean | null;
  views?: number | string | null;
  created_at?: string | null;
  created_at_ts?: number | null;
  expires_at_ts?: number | null;
  updated_at?: string | null;
  seller?: any;
  category?: any;
};

type EdgeSearchProductRow = SupabaseProductRow & { rank?: number | string | null };

type EdgeSearchResponse = {
  items?: EdgeSearchProductRow[] | null;
  totalCount?: number | string | null;
  limit?: number | null;
  offset?: number | null;
};

function toSupabaseRowFromEdge(row: EdgeSearchProductRow): SupabaseProductRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    price: row.price ?? null,
    original_price: row.original_price ?? null,
    currency: row.currency ?? null,
    condition: row.condition ?? null,
    category_id: row.category_id ?? null,
    seller_id: row.seller_id,
    location: row.location ?? null,
    images: row.images ?? null,
    is_active: row.is_active ?? null,
    is_sold: row.is_sold ?? null,
    is_promoted: row.is_promoted ?? null,
    views: row.views ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    seller: row.seller ?? null,
    category: row.category ?? null,
  };
}

function parseCountValue(value: number | string | null | undefined, fallback: number) {
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

function quoteAlgoliaFilterValue(value: string): string {
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function resolveLocationFilter(value: string | null | undefined): string | null {
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

function buildAlgoliaSearchFilters(filters: ProductFilters, looksFree: boolean) {
  const clauses = ['is_active:true', 'is_sold:false'];

  if (filters.category) {
    clauses.push(`category_id:${quoteAlgoliaFilterValue(filters.category)}`);
  }

  if (filters.condition) {
    clauses.push(`condition:${quoteAlgoliaFilterValue(filters.condition)}`);
  }

  if (filters.color) {
    clauses.push(`color_token:${quoteAlgoliaFilterValue(filters.color)}`);
  }

  const location = resolveLocationFilter(filters.location);
  if (location) {
    clauses.push(`location_normalized:${quoteAlgoliaFilterValue(location)}`);
  }

  const numericFilters: string[] = [];
  const minPrice = looksFree ? 0 : filters.minPrice;
  const maxPrice = looksFree ? 0 : filters.maxPrice;

  numericFilters.push(`expires_at_ts>=${Date.now()}`);

  if (typeof minPrice === 'number') {
    numericFilters.push(`price>=${minPrice}`);
  }

  if (typeof maxPrice === 'number') {
    numericFilters.push(`price<=${maxPrice}`);
  }

  return {
    filters: clauses.join(' AND '),
    numericFilters,
  };
}

function resolveAlgoliaIndexName(sort: ProductSort, baseIndex: string): string {
  switch (sort) {
    case 'price_asc':
      return `${baseIndex}_price_asc`;
    case 'price_desc':
      return `${baseIndex}_price_desc`;
    case 'views_desc':
      return `${baseIndex}_views_desc`;
    case 'newest':
    default:
      return `${baseIndex}_newest`;
  }
}

function mapProductFromAlgolia(hit: AlgoliaSearchHit): ProductWithRelations | null {
  const id =
    typeof hit.objectID === 'string' && hit.objectID.length > 0
      ? hit.objectID
      : typeof hit.id === 'string'
      ? hit.id
      : '';

  if (!id) {
    return null;
  }

  const imagePaths = Array.isArray(hit.images) ? hit.images.filter((item): item is string => typeof item === 'string') : [];
  const imageUrls = imagePaths
    .map((path) => resolvePublicImageUrl(path))
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

  if (imageUrls.length === 0 && hit.image_thumb_path) {
    const fallbackUrl = buildPublicStorageUrl(hit.image_thumb_path);
    if (fallbackUrl) {
      imageUrls.push(fallbackUrl);
    }
  }

  const seller =
    hit.seller_id
      ? mapSeller({
          id: hit.seller_id,
          email: hit.seller_email ?? null,
          phone: null,
          full_name: hit.seller_full_name ?? null,
          name: hit.seller_name ?? null,
          avatar_url: hit.seller_avatar ?? null,
          location: null,
          bio: null,
          is_verified: hit.seller_is_verified ?? false,
          rating: null,
          total_ratings: null,
          created_at: null,
          updated_at: null,
        })
      : null;

  const category = hit.category_id
    ? mapCategory({
        id: hit.category_id,
        name: hit.category_name ?? 'Unnamed',
        name_ar: hit.category_name_ar ?? null,
        name_ku: hit.category_name_ku ?? null,
        description: null,
        icon: null,
        is_active: true,
        sort_order: null,
        created_at: null,
      })
    : null;

  const originalPriceValue = parseNumber(hit.original_price);
  const titleTranslations = normalizeTranslationMap({
    en: hit.title_i18n_en ?? undefined,
    ar: hit.title_i18n_ar ?? undefined,
    ku: hit.title_i18n_ku ?? undefined,
    ku_latn: hit.title_i18n_ku_latn ?? undefined,
  });
  const descriptionTranslations = normalizeTranslationMap({
    en: hit.description_i18n_en ?? undefined,
    ar: hit.description_i18n_ar ?? undefined,
    ku: hit.description_i18n_ku ?? undefined,
    ku_latn: hit.description_i18n_ku_latn ?? undefined,
  });

  return {
    id,
    title: hit.title ?? '',
    description: hit.description ?? null,
    titleTranslations,
    descriptionTranslations,
    price: parseNumber(hit.price) ?? 0,
    currency: hit.currency ?? 'IQD',
    condition: hit.condition ?? null,
    colorToken: hit.color_token ?? null,
    categoryId: hit.category_id ?? null,
    sellerId: hit.seller_id ?? '',
    location: hit.location ?? null,
    imagePaths,
    imageUrls,
    isActive: typeof hit.is_active === 'boolean' ? hit.is_active : true,
    isSold: typeof hit.is_sold === 'boolean' ? hit.is_sold : false,
    isPromoted: typeof hit.is_promoted === 'boolean' ? hit.is_promoted : false,
    views: parseNumber(hit.views) ?? 0,
    createdAt: toDate(hit.created_at ?? null),
    updatedAt: toDate(hit.updated_at ?? null),
    seller,
    category,
    originalPrice: originalPriceValue ?? undefined,
  };
}

async function searchProductsViaAlgolia(
  searchTerm: string,
  filters: ProductFilters,
  limit: number,
  offset: number,
  sort: ProductSort,
  looksFree: boolean,
): Promise<{ items: ProductWithRelations[]; count: number } | null> {
  const client = getAlgoliaClient();
  const baseIndexName = algoliaIndexName;
  if (!client || !baseIndexName) {
    return null;
  }

  try {
    const safeLimit = Math.max(1, limit);
    const page = Math.max(0, Math.floor(offset / safeLimit));
    const { filters: filterString, numericFilters } = buildAlgoliaSearchFilters(filters, looksFree);
    const indexName = resolveAlgoliaIndexName(sort, baseIndexName);

    const searchParams: Record<string, unknown> = {
      query: searchTerm,
      page,
      hitsPerPage: safeLimit,
      filters: filterString,
      attributesToRetrieve: [
        'objectID',
        'id',
        'title',
        'title_i18n_en',
        'title_i18n_ar',
        'title_i18n_ku',
        'title_i18n_ku_latn',
        'description',
        'description_i18n_en',
        'description_i18n_ar',
        'description_i18n_ku',
        'description_i18n_ku_latn',
        'price',
        'original_price',
        'currency',
        'condition',
        'color_token',
        'category_id',
        'category_name',
        'category_name_ar',
        'category_name_ku',
        'seller_id',
        'seller_full_name',
        'seller_name',
        'seller_email',
        'seller_avatar',
        'seller_is_verified',
        'location',
        'images',
        'image_thumb_path',
        'is_active',
        'is_sold',
        'is_promoted',
        'views',
        'created_at',
        'created_at_ts',
        'expires_at_ts',
        'updated_at',
      ],
      attributesToHighlight: [],
    };

    if (numericFilters.length > 0) {
      searchParams.numericFilters = numericFilters;
    }

    const result = await client.searchSingleIndex<AlgoliaSearchHit>({
      indexName,
      searchParams,
    });
    const hits = Array.isArray(result.hits) ? result.hits : [];
    const count = typeof result.nbHits === 'number' ? result.nbHits : hits.length;

    if (hits.length === 0) {
      return { items: [], count };
    }

    const items = hits
      .map((hit) => mapProductFromAlgolia(hit))
      .filter((product): product is ProductWithRelations => Boolean(product));

    return { items, count };
  } catch (error) {
    console.error('Algolia search failed', error);
    return null;
  }
}

export async function searchProducts(
  filters: ProductFilters,
  limit = 20,
  offset = 0,
  sort: ProductSort = 'newest'
): Promise<{ items: ProductWithRelations[]; count: number }> {
  const supabase = await getSupabase();

  const searchTerm = filters.search?.trim();
  if (!searchTerm) {
    return getProductsWithCount({ ...filters, search: undefined }, limit, offset, sort);
  }

  const term = searchTerm.toLowerCase();
  const looksFree =
    filters.freeOnly === true ||
    term.includes('free') ||
    term.includes('مجاني') ||
    term.includes('مجانا') ||
    term.includes('فري') ||
    term.includes('بلاش');

  const algoliaResult = await searchProductsViaAlgolia(
    searchTerm,
    filters,
    limit,
    offset,
    sort,
    looksFree,
  );
  if (algoliaResult && algoliaResult.items.length > 0) {
    return algoliaResult;
  }

  const { data, error } = await supabase.functions.invoke('product-search', {
    body: {
      query: searchTerm,
      categoryId: filters.category,
      minPrice: looksFree ? 0 : filters.minPrice,
      maxPrice: looksFree ? 0 : filters.maxPrice,
      city: filters.location,
      limit,
      offset,
    },
  });

  if (error) {
    console.error('Failed to search products', error);
    return { items: [], count: 0 };
  }

  const payload = (data ?? {}) as EdgeSearchResponse;
  const baseRows = Array.isArray(payload.items) ? payload.items : [];

  if (baseRows.length === 0) {
    const parsedCount = parseCountValue(payload.totalCount ?? null, 0);
    return { items: [], count: parsedCount };
  }

  const ids = baseRows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (ids.length === 0) {
    return { items: [], count: parseCountValue(payload.totalCount ?? null, 0) };
  }

  const nowIso = new Date().toISOString();
  const { data: detailData, error: detailError } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', ids)
    .gt('expires_at', nowIso);

  if (detailError) {
    console.error('Failed to load product relations for search results', detailError);
  }

  const detailRows = Array.isArray(detailData) ? (detailData as SupabaseProductRow[]) : [];
  const detailMap = new Map<string, ProductWithRelations>();
  for (const row of detailRows) {
    detailMap.set(row.id, mapProduct(row));
  }

  const fallbackMap = new Map<string, ProductWithRelations>();
  for (const row of baseRows) {
    fallbackMap.set(row.id, mapProduct(toSupabaseRowFromEdge(row)));
  }

  const orderedItems = ids
    .map((id) => detailMap.get(id) ?? fallbackMap.get(id))
    .filter((product): product is ProductWithRelations => Boolean(product));

  const offsetValue = parseNumber(payload.offset ?? null) ?? offset;
  const parsedCount = parseCountValue(
    payload.totalCount ?? null,
    orderedItems.length + offsetValue
  );

  const sortedItems = sortProductsInMemory(orderedItems, sort);
  if (!detailError) {
    await hydrateSellerProfiles(sortedItems);
  }
  hydrateProductPublicImages(sortedItems);
  return { items: sortedItems, count: parsedCount };
}

export async function getProducts(
  filters: ProductFilters = {},
  limit = 20,
  offset = 0,
  sort: ProductSort = 'newest'
): Promise<ProductWithRelations[]> {
  const supabase = await getSupabase();
  const rangeEnd = limit > 0 ? offset + limit - 1 : offset;

  let query = buildProductsQuery(supabase, filters, { withCount: false });
  query = applyProductsSort(query, sort);

  const { data, error } = await query.range(offset, rangeEnd);

  if (error) {
    console.error('Failed to load products', error);
    return [];
  }

  const rows = (data ?? []) as SupabaseProductRow[];
  const products = rows.map((row) => mapProduct(row));
  await hydrateSellerProfiles(products);
  hydrateProductPublicImages(products);
  return products;
}

export async function getProductsWithCount(
  filters: ProductFilters = {},
  limit = 20,
  offset = 0,
  sort: ProductSort = 'newest'
): Promise<{ items: ProductWithRelations[]; count: number }> {
  const supabase = await getSupabase();
  const rangeEnd = limit > 0 ? offset + limit - 1 : offset;

  let query = buildProductsQuery(supabase, filters, { withCount: true });
  query = applyProductsSort(query, sort);

  const { data, error, count } = await query.range(offset, rangeEnd);

  if (error) {
    console.error('Failed to load products', error);
    return { items: [], count: 0 };
  }

  const rows = (data ?? []) as SupabaseProductRow[];
  const items = rows.map((row) => mapProduct(row));
  await hydrateSellerProfiles(items);
  hydrateProductPublicImages(items);
  return {
    items,
    count: count ?? 0,
  };
}

const CURATED_CITY_LABELS = MARKET_CITY_OPTIONS
  .filter((option) => option.value !== 'all')
  .map((option) => option.label);

export async function getAvailableLocations(limit = 50): Promise<string[]> {
  const supabase = await getSupabase();
  const ordered = new Map<string, string>();
  CURATED_CITY_LABELS.forEach((label) => ordered.set(label.toLowerCase(), label));

  const { data, error } = await supabase
    .from('products')
    .select('location')
    .not('location', 'is', null)
    .neq('location', '')
    .gt('expires_at', new Date().toISOString())
    .order('location', { ascending: true })
    .limit(limit);

  if (!error) {
    const rows = (data ?? []) as SupabaseLocationRow[];
    for (const row of rows) {
      const value = typeof row.location === 'string' ? row.location.trim() : '';
      if (!value) continue;
      const label = getMarketCityLabel(value);
      ordered.set(label.toLowerCase(), label);
    }
  } else {
    console.error('Failed to load locations', error);
  }

  return Array.from(ordered.values());
}

type ImageTransformOptions = {
  width?: number;
  height?: number;
  resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'webp' | 'png' | 'jpeg';
};

async function hydrateProductImages(
  products: ProductWithRelations[],
  options?: { transform?: ImageTransformOptions },
): Promise<void> {
  const allPaths = Array.from(
    new Set(products.flatMap((product) => product.imagePaths).filter(Boolean)),
  );

  if (!allPaths.length) {
    return;
  }

  const signedMap = options?.transform
    ? await createTransformedSignedUrls(allPaths, options.transform)
    : await createSignedUrls(allPaths);

  for (const product of products) {
    const urls = product.imagePaths
      .map((path) => signedMap[path])
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
    product.imageUrls = urls;
  }
}

// Cached wrappers are defined in products-cache.ts to avoid importing next/cache here.

export async function getProductById(id: string): Promise<ProductWithRelations | null> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error('Failed to load product', error);
    }
    return null;
  }

  const product = mapProduct(data as SupabaseProductRow);
  await hydrateSellerProfiles([product]);
  const name = product.category?.name?.toLowerCase() ?? '';
  const isHiRes = ['vehicle', 'vehicles', 'car', 'cars', 'auto', 'automotive', 'real estate', 'property', 'properties'].some((kw) => name.includes(kw));
  const width = isHiRes ? 1920 : 1400;
  const quality = isHiRes ? 88 : 85;
  await hydrateProductImages([product], { transform: { width, resize: 'inside', quality, format: 'webp' } });
  return product;
}

export async function getProductMetadataById(id: string): Promise<ProductMetadata | null> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('products')
    .select('id, title, description, title_translations, description_translations, images')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error('Failed to load product metadata', error);
    }
    return null;
  }

  const row = data as SupabaseProductMetadataRow;
  const imageUrls = normalizeImages(row.images)
    .map((path) => resolvePublicImageUrl(path))
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    titleTranslations: normalizeTranslationMap(row.title_translations),
    descriptionTranslations: normalizeTranslationMap(row.description_translations),
    imageUrls,
  };
}

export async function getCategories(): Promise<MarketplaceCategory[]> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, name_ar, name_ku, description, icon, is_active, sort_order, created_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to load categories', error);
    return [];
  }

  const rows = (data ?? []) as SupabaseCategoryRow[];
  return rows
    .map((row) => mapCategory(row))
    .filter((category): category is MarketplaceCategory => Boolean(category));
}

// Cached wrappers are defined in products-cache.ts to avoid importing next/cache here.

export async function createProduct(productData: {
  title: string;
  description?: string | null;
  price: number;
  currency?: string | null;
  condition: string;
  categoryId?: string | null;
  location?: string | null;
  images?: string[];
  sellerId: string;
}): Promise<ProductWithRelations | null> {
  const supabase = await getSupabase();
  const images = assertAllowedProductImagePaths(productData.images);

  const payload = {
    title: productData.title,
    description: productData.description ?? null,
    price: productData.price,
    currency: productData.currency ?? 'IQD',
    condition: productData.condition,
    category_id: productData.categoryId ?? null,
    location: productData.location ?? null,
    images,
    seller_id: productData.sellerId,
    is_active: true,
  };

  const { data, error } = await supabase.from('products').insert(payload).select('*').maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProduct(data as SupabaseProductRow) : null;
}

export async function incrementProductViews(productId: string): Promise<void> {
  const supabase = await getSupabase();

  const { data, error } = await supabase.from('products').select('views').eq('id', productId).single();

  if (error) {
    console.error('Failed to read product views', error);
    return;
  }

  const currentViews = typeof data?.views === 'number' ? data.views : data?.views ? Number(data.views) : 0;

  const { error: updateError } = await supabase
    .from('products')
    .update({ views: currentViews + 1 })
    .eq('id', productId);

  if (updateError) {
    console.error('Failed to increment product views', updateError);
  }
}

export async function getRecommendedProducts(
  productId: string,
  limit = 6,
): Promise<ProductWithRelations[]> {
  const supabase = await getSupabase();

  let response: {
    data: unknown;
    error: any;
    status?: number;
  };

  try {
    response = await supabase.functions.invoke('recommend-products', {
      body: {
        productId,
        limit,
      },
    });
  } catch (invokeError) {
    console.error('Failed to invoke recommend-products function', invokeError);
    return [];
  }

  const { data, error, status } = response;

  if (error || (typeof status === 'number' && status >= 400)) {
    const payload = (data ?? {}) as { error?: string };
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to load recommendations', payload.error || error?.message || null, {
        status,
      });
    }
    return [];
  }

  const payload = (data ?? {}) as { items?: SupabaseProductRow[] | null };
  const rows = Array.isArray(payload.items) ? payload.items : [];
  if (!rows.length) {
    return [];
  }

  const products = rows
    .map((row) => mapProduct(row))
    .filter((product) => product.id !== productId);
  await hydrateSellerProfiles(products);
  hydrateProductPublicImages(products);
  return products;
}

export async function getSimilarProducts(
  productId: string,
  categoryId: string | null,
  location: string | null = null,
  limit = 6,
): Promise<ProductWithRelations[]> {
  const normalizedLocation = normalizeMarketCityValue(location);
  const cityQuery = normalizedLocation
    ? DEFAULT_MARKET_CITIES.find((city) => normalizedLocation === city || normalizedLocation.includes(city)) ?? normalizedLocation
    : '';

  const matchesCity = (value: string | null | undefined) => {
    if (!cityQuery) {
      return true;
    }

    const candidate = normalizeMarketCityValue(value);
    if (!candidate) {
      return false;
    }

    return candidate.includes(cityQuery) || cityQuery.includes(candidate);
  };

  const matchesFilters = (product: ProductWithRelations, opts?: { requireCity?: boolean }) => {
    if (!product || product.id === productId) {
      return false;
    }
    if (product.isSold || !product.isActive) {
      return false;
    }
    if (categoryId && product.categoryId !== categoryId) {
      return false;
    }
    if (opts?.requireCity ?? true) {
      return matchesCity(product.location);
    }
    return true;
  };

  let recommended: ProductWithRelations[] = [];
  try {
    recommended = await getRecommendedProducts(productId, limit * 4);
  } catch (error) {
    console.error('Failed to load recommendations', error);
  }

  const filteredRecommendedSameCity = recommended
    .filter((product) => matchesFilters(product, { requireCity: Boolean(cityQuery) }))
    .slice(0, limit);
  if (filteredRecommendedSameCity.length >= limit || !categoryId) {
    return filteredRecommendedSameCity;
  }

  const fallbackFiltersSameCity: ProductFilters = { category: categoryId };
  if (cityQuery) {
    fallbackFiltersSameCity.location = cityQuery;
  }

  const [fallbackSameCity, fallbackSameCategory] = await Promise.all([
    getProducts(fallbackFiltersSameCity, limit * 4, 0, 'newest'),
    getProducts({ category: categoryId }, limit * 4, 0, 'newest'),
  ]);

  const seen = new Set<string>();
  const merged: ProductWithRelations[] = [];

  const pushUnique = (product: ProductWithRelations, opts?: { requireCity?: boolean }) => {
    if (!matchesFilters(product, opts)) {
      return;
    }
    if (seen.has(product.id)) {
      return;
    }
    seen.add(product.id);
    merged.push(product);
  };

  for (const product of [...filteredRecommendedSameCity, ...fallbackSameCity]) {
    if (merged.length >= limit) break;
    pushUnique(product, { requireCity: Boolean(cityQuery) });
  }

  if (merged.length < limit && cityQuery) {
    for (const product of [...recommended, ...fallbackSameCategory]) {
      if (merged.length >= limit) break;
      pushUnique(product, { requireCity: false });
    }
  }

  return merged;
}
