import { cookies } from "next/headers";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createSignedUrls, createTransformedSignedUrls } from '@/lib/storage';
import { MARKET_CITY_OPTIONS, getMarketCityLabel } from '@/data/market-cities';
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

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
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

  if (filters.category) {
    query = query.eq('category_id', filters.category);
  }

  if (filters.condition) {
    query = query.eq('condition', filters.condition);
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

  const { data: detailData, error: detailError } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', ids);

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
  await hydrateProductImages(sortedItems, { transform: { width: 512, resize: 'cover', quality: 80, format: 'webp' } });
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
  await hydrateProductImages(products, { transform: { width: 512, resize: 'cover', quality: 80, format: 'webp' } });
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
  await hydrateProductImages(items, { transform: { width: 512, resize: 'cover', quality: 80, format: 'webp' } });
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

  const payload = {
    title: productData.title,
    description: productData.description ?? null,
    price: productData.price,
    currency: productData.currency ?? 'IQD',
    condition: productData.condition,
    category_id: productData.categoryId ?? null,
    location: productData.location ?? null,
    images: productData.images ?? [],
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
  await hydrateProductImages(products, {
    transform: { width: 512, resize: 'cover', quality: 80, format: 'webp' },
  });
  return products;
}

export async function getSimilarProducts(
  productId: string,
  categoryId: string | null,
  limit = 6,
): Promise<ProductWithRelations[]> {
  let recommended: ProductWithRelations[] = [];
  try {
    recommended = await getRecommendedProducts(productId, limit);
  } catch (error) {
    console.error('Failed to load recommendations', error);
  }

  if (recommended.length > 0) {
    return recommended.slice(0, limit);
  }

  if (!categoryId) {
    return [];
  }

  const fallback = await getProducts({ category: categoryId }, limit * 2, 0, 'newest');
  return fallback.filter((product) => product.id !== productId).slice(0, limit);
}
