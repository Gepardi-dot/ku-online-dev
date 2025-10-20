import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export interface SellerProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
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
  categoryId: string | null;
  sellerId: string;
  location: string | null;
  images: string[];
  isActive: boolean;
  isSold: boolean;
  isPromoted: boolean;
  views: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  seller: SellerProfile | null;
  category?: MarketplaceCategory | null;
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'views_desc';

export interface ProductFilters {
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  search?: string;
  sellerId?: string;
  sort?: ProductSort;
  createdAfter?: string;
}

const PRODUCT_SELECT = `*,
       seller:users!products_seller_id_fkey(
         id,
         email,
         phone,
         full_name,
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

type SupabaseProductRow = {
  id: string;
  title: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  condition: string | null;
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

function mapSeller(row: any | null): SellerProfile | null {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email ?? null,
    phone: row.phone ?? null,
    fullName: row.full_name ?? row.fullName ?? null,
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

function mapProduct(row: SupabaseProductRow): ProductWithRelations {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: typeof row.price === "number" ? row.price : row.price ? Number(row.price) : 0,
    currency: row.currency ?? "IQD",
    condition: row.condition,
    categoryId: row.category_id,
    sellerId: row.seller_id,
    location: row.location,
    images: normalizeImages(row.images),
    isActive: row.is_active ?? true,
    isSold: row.is_sold ?? false,
    isPromoted: row.is_promoted ?? false,
    views: typeof row.views === "number" ? row.views : row.views ? Number(row.views) : 0,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    seller: mapSeller(row.seller ?? null),
    category: mapCategory(row.category ?? null),
  };
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

function buildProductsQuery(supabase: any, filters: ProductFilters = {}, options: { withCount?: boolean } = {}) {
  let query = options.withCount
    ? supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' as const })
    : supabase.from('products').select(PRODUCT_SELECT);

  query = query.eq('is_active', true);

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
  return rows.map((row) => mapProduct(row));
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
  return {
    items: rows.map((row) => mapProduct(row)),
    count: count ?? 0,
  };
}

export async function getAvailableLocations(limit = 50): Promise<string[]> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('products')
    .select('location')
    .not('location', 'is', null)
    .neq('location', '')
    .order('location', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Failed to load locations', error);
    return [];
  }

  const uniqueValues = new Set<string>();
  const rows = (data ?? []) as SupabaseLocationRow[];
  for (const row of rows) {
    const value = typeof row.location === 'string' ? row.location.trim() : '';
    if (value) {
      uniqueValues.add(value);
    }
  }

  return Array.from(uniqueValues);
}

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

  return mapProduct(data as SupabaseProductRow);
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

export async function getSimilarProducts(
  productId: string,
  categoryId: string | null,
  limit = 6
): Promise<ProductWithRelations[]> {
  if (!categoryId) {
    return [];
  }

  const products = await getProducts({ category: categoryId }, limit * 2, 0, 'newest');
  return products.filter((product) => product.id !== productId).slice(0, limit);
}
