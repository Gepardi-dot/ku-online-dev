import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export type SponsorTier = 'basic' | 'featured';

export type SponsorStore = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryCity: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  ownerUserId: string | null;
  sponsorTier: SponsorTier;
  isFeatured: boolean;
  updatedAt: Date | null;
};

export type SponsorOfferDiscountType = 'percent' | 'amount' | 'freebie' | 'custom';

export type SponsorStoreLocation = {
  id: string;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  isPrimary: boolean;
};

export type SponsorStoreCategory = {
  id: string;
  name: string;
  nameAr: string | null;
  nameKu: string | null;
  icon: string | null;
};

export type SponsorStoreDetails = SponsorStore & {
  locations: SponsorStoreLocation[];
  categories: SponsorStoreCategory[];
};

export type SponsorOffer = {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  discountType: SponsorOfferDiscountType;
  discountValue: number | null;
  currency: string | null;
  endAt: Date | null;
  store: Pick<SponsorStore, 'id' | 'name' | 'slug' | 'logoUrl' | 'primaryCity'> | null;
};

export type SponsorOfferDetails = SponsorOffer & {
  terms: string | null;
  startAt: Date | null;
  store: Pick<SponsorStore, 'id' | 'name' | 'slug' | 'logoUrl' | 'primaryCity' | 'phone' | 'whatsapp' | 'website'> | null;
};

export type SponsorOfferPreview = Pick<
  SponsorOffer,
  'id' | 'storeId' | 'title' | 'discountType' | 'discountValue' | 'currency' | 'endAt'
> & {
  originalPrice: number | null;
  dealPrice: number | null;
};

type SponsorStoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  primary_city: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  owner_user_id?: string | null;
  sponsor_tier: string | null;
  is_featured: boolean | null;
  updated_at: string | null;
};

type SponsorStoreLocationRow = {
  id: string;
  city: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  phone: string | null;
  is_primary: boolean | null;
};

type SponsorStoreCategoryLinkRow = {
  category: {
    id: string;
    name: string | null;
    name_ar: string | null;
    name_ku: string | null;
    icon: string | null;
  } | null;
};

type SponsorOfferRow = {
  id: string;
  store_id: string | null;
  title: string | null;
  description: string | null;
  terms?: string | null;
  start_at?: string | null;
  discount_type: string | null;
  discount_value: number | string | null;
  currency: string | null;
  end_at: string | null;
  sponsor_stores?: SponsorStoreRow | SponsorStoreRow[] | null;
};

type SponsorOfferPreviewRow = {
  id: string;
  store_id: string | null;
  title: string | null;
  discount_type: string | null;
  discount_value: number | string | null;
  currency: string | null;
  end_at: string | null;
  original_price?: number | string | null;
  deal_price?: number | string | null;
  is_featured?: boolean | null;
  created_at?: string | null;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toFloat(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return parsed;
}

function normalizeTier(value: unknown): SponsorTier {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'featured' ? 'featured' : 'basic';
}

function normalizeDiscountType(value: unknown): SponsorOfferDiscountType {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'percent' || normalized === 'amount' || normalized === 'freebie') {
    return normalized;
  }
  return 'custom';
}

function mapStore(row: SponsorStoreRow): SponsorStore {
  return {
    id: row.id,
    name: row.name ?? 'Store',
    slug: row.slug ?? row.id,
    description: row.description ?? null,
    logoUrl: row.logo_url ?? null,
    coverUrl: row.cover_url ?? null,
    primaryCity: row.primary_city ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    website: row.website ?? null,
    ownerUserId: row.owner_user_id ?? null,
    sponsorTier: normalizeTier(row.sponsor_tier),
    isFeatured: Boolean(row.is_featured),
    updatedAt: toDate(row.updated_at),
  };
}

function mapOffer(row: SponsorOfferRow): SponsorOffer {
  const storeCandidate = row.sponsor_stores ?? null;
  const storeRow = Array.isArray(storeCandidate) ? storeCandidate[0] ?? null : storeCandidate;
  const store = storeRow
    ? {
        id: storeRow.id,
        name: storeRow.name ?? 'Store',
        slug: storeRow.slug ?? storeRow.id,
        logoUrl: storeRow.logo_url ?? null,
        primaryCity: storeRow.primary_city ?? null,
      }
    : null;

  return {
    id: row.id,
    storeId: row.store_id ?? '',
    title: row.title ?? 'Offer',
    description: row.description ?? null,
    discountType: normalizeDiscountType(row.discount_type),
    discountValue: toNumber(row.discount_value),
    currency: row.currency ?? null,
    endAt: toDate(row.end_at),
    store,
  };
}

function mapOfferDetails(row: SponsorOfferRow): SponsorOfferDetails {
  const base = mapOffer(row);
  const storeCandidate = row.sponsor_stores ?? null;
  const storeRow = Array.isArray(storeCandidate) ? storeCandidate[0] ?? null : storeCandidate;
  const store = storeRow
    ? {
        id: storeRow.id,
        name: storeRow.name ?? 'Store',
        slug: storeRow.slug ?? storeRow.id,
        logoUrl: storeRow.logo_url ?? null,
        primaryCity: storeRow.primary_city ?? null,
        phone: storeRow.phone ?? null,
        whatsapp: storeRow.whatsapp ?? null,
        website: storeRow.website ?? null,
      }
    : null;

  return {
    ...base,
    terms: typeof row.terms === 'string' ? row.terms : null,
    startAt: toDate(typeof row.start_at === 'string' ? row.start_at : null),
    store,
  };
}

function mapOfferPreview(row: SponsorOfferPreviewRow): SponsorOfferPreview {
  return {
    id: row.id,
    storeId: row.store_id ?? '',
    title: row.title ?? 'Offer',
    discountType: normalizeDiscountType(row.discount_type),
    discountValue: toNumber(row.discount_value),
    currency: row.currency ?? null,
    endAt: toDate(row.end_at),
    originalPrice: toNumber(row.original_price),
    dealPrice: toNumber(row.deal_price),
  };
}

function mapLocation(row: SponsorStoreLocationRow): SponsorStoreLocation {
  return {
    id: row.id,
    city: row.city ?? null,
    address: row.address ?? null,
    lat: toFloat(row.lat),
    lng: toFloat(row.lng),
    phone: row.phone ?? null,
    isPrimary: Boolean(row.is_primary),
  };
}

function mapCategoryLink(row: SponsorStoreCategoryLinkRow): SponsorStoreCategory | null {
  const category = row.category;
  if (!category?.id) return null;
  return {
    id: category.id,
    name: category.name ?? 'Category',
    nameAr: category.name_ar ?? null,
    nameKu: category.name_ku ?? null,
    icon: category.icon ?? null,
  };
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

export async function listFeaturedSponsorStores(options: {
  city?: string | null;
  limit?: number;
} = {}): Promise<SponsorStore[]> {
  const supabase = await getSupabase();
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 10;
  const city = typeof options.city === 'string' ? options.city.trim().toLowerCase() : '';

  const selectWithOwner =
    'id, name, slug, description, logo_url, cover_url, primary_city, phone, whatsapp, website, owner_user_id, sponsor_tier, is_featured, updated_at';
  const selectWithoutOwner =
    'id, name, slug, description, logo_url, cover_url, primary_city, phone, whatsapp, website, sponsor_tier, is_featured, updated_at';

  const runQuery = (selectFields: string) => {
    let query = supabase
      .from('sponsor_stores')
      .select(selectFields)
      .eq('is_featured', true)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (city && city !== 'all') {
      query = query.eq('primary_city', city);
    }

    return query;
  };

  let data: any = null;
  let error: any = null;
  ({ data, error } = await runQuery(selectWithOwner));

  if (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const code = typeof error?.code === 'string' ? error.code : '';
    if (message.toLowerCase().includes('owner_user_id') || code === '42703') {
      ({ data, error } = await runQuery(selectWithoutOwner));
    }
  }

  if (error) {
    console.error('Failed to load featured sponsor stores', error);
    return [];
  }

  return (data ?? []).map((row: SponsorStoreRow) => mapStore(row as unknown as SponsorStoreRow));
}

export async function listSpotlightSponsorStores(options: { city?: string | null; limit?: number } = {}): Promise<SponsorStore[]> {
  const supabase = await getSupabase();
  const limit = typeof options.limit === 'number' && options.limit > 0 ? Math.min(options.limit, 20) : 8;
  const city = typeof options.city === 'string' ? options.city.trim().toLowerCase() : '';

  const selectWithOwner =
    'id, name, slug, description, logo_url, cover_url, primary_city, phone, whatsapp, website, owner_user_id, sponsor_tier, is_featured, updated_at';
  const selectWithoutOwner =
    'id, name, slug, description, logo_url, cover_url, primary_city, phone, whatsapp, website, sponsor_tier, is_featured, updated_at';

  const runQuery = (selectFields: string) => {
    let query = supabase
      .from('sponsor_stores')
      .select(selectFields)
      .eq('status', 'active')
      .order('is_featured', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('name', { ascending: true })
      .limit(limit);

    if (city && city !== 'all') {
      query = query.eq('primary_city', city);
    }

    return query;
  };

  let data: any = null;
  let error: any = null;
  ({ data, error } = await runQuery(selectWithOwner));

  if (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const code = typeof error?.code === 'string' ? error.code : '';
    if (message.toLowerCase().includes('owner_user_id') || code === '42703') {
      ({ data, error } = await runQuery(selectWithoutOwner));
    }
  }

  if (error) {
    console.error('Failed to load spotlight sponsor stores', error);
    return [];
  }

  return (data ?? []).map((row: SponsorStoreRow) => mapStore(row as unknown as SponsorStoreRow));
}

export async function listSponsorOfferPreviewsByStoreIds(storeIds: string[]): Promise<Record<string, SponsorOfferPreview>> {
  const unique = Array.from(new Set((storeIds ?? []).filter(Boolean)));
  if (!unique.length) return {};

  const supabase = await getSupabase();
  const nowIso = new Date().toISOString();

  const normalizeError = (err: any) => ({
    message: typeof err?.message === 'string' ? err.message : '',
    code: typeof err?.code === 'string' ? err.code : '',
    details: typeof err?.details === 'string' ? err.details : '',
    hint: typeof err?.hint === 'string' ? err.hint : '',
  });

  const isMissingTable = (err: any) => {
    const { message, code } = normalizeError(err);
    const msg = message.toLowerCase();
    return code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'));
  };

  const isMissingColumn = (err: any) => {
    const { message, code } = normalizeError(err);
    const msg = message.toLowerCase();
    return code === '42703' || (msg.includes('column') && msg.includes('does not exist'));
  };

  const runQuery = async (selectFields: string) =>
    supabase
      .from('sponsor_offers')
      .select(selectFields)
      .in('store_id', unique)
      .eq('status', 'active')
      .lte('start_at', nowIso)
      .or(`end_at.is.null,end_at.gt.${nowIso}`)
      .order('is_featured', { ascending: false })
      .order('end_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

  let data: unknown[] | null = null;
  let error: any = null;

  const fieldSets = [
    'id, store_id, title, discount_type, discount_value, currency, end_at, original_price, deal_price, is_featured, created_at',
    'id, store_id, title, discount_type, discount_value, currency, end_at, is_featured, created_at',
    'id, store_id, title, end_at, is_featured, created_at',
  ];

  for (const fields of fieldSets) {
    ({ data, error } = await runQuery(fields));
    if (!error) break;
    if (isMissingTable(error)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Sponsor offers table missing; skipping offer previews.');
      }
      return {};
    }
    if (!isMissingColumn(error)) {
      const meta = normalizeError(error);
      console.error('Failed to load sponsor offer previews', meta);
      return {};
    }
  }

  if (error) {
    const meta = normalizeError(error);
    console.error('Failed to load sponsor offer previews', meta);
    return {};
  }

  const out: Record<string, SponsorOfferPreview> = {};
  for (const row of (data ?? []) as unknown as SponsorOfferPreviewRow[]) {
    const storeId = row.store_id ?? '';
    if (!storeId) continue;
    if (out[storeId]) continue;
    out[storeId] = mapOfferPreview(row);
  }
  return out;
}

export async function listSponsorStores(
  filters: { city?: string | null; categoryId?: string | null; search?: string | null } = {},
  limit = 24,
  offset = 0,
): Promise<SponsorStore[]> {
  const supabase = await getSupabase();
  const boundedLimit = limit > 0 ? Math.min(limit, 60) : 24;
  const rangeEnd = boundedLimit > 0 ? offset + boundedLimit - 1 : offset;
  const city = typeof filters.city === 'string' ? filters.city.trim().toLowerCase() : '';
  const categoryId = typeof filters.categoryId === 'string' ? filters.categoryId.trim() : '';
  const search = typeof filters.search === 'string' ? filters.search.trim() : '';

  const baseWithOwner =
    'id, name, slug, description, logo_url, cover_url, primary_city, phone, whatsapp, website, owner_user_id, sponsor_tier, is_featured, updated_at';
  const baseWithoutOwner =
    'id, name, slug, description, logo_url, cover_url, primary_city, phone, whatsapp, website, sponsor_tier, is_featured, updated_at';

  const runQuery = (selectFields: string) => {
    let query = supabase
      .from('sponsor_stores')
      .select(selectFields)
      .order('is_featured', { ascending: false })
      .order('name', { ascending: true });

    if (city && city !== 'all') {
      query = query.eq('primary_city', city);
    }

    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&');
      query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    if (categoryId) {
      const selectWithJoin = `${selectFields}, sponsor_store_categories!inner(category_id)`;
      query = supabase
        .from('sponsor_stores')
        .select(selectWithJoin)
        .eq('sponsor_store_categories.category_id', categoryId)
        .order('is_featured', { ascending: false })
        .order('name', { ascending: true });

      if (city && city !== 'all') {
        query = query.eq('primary_city', city);
      }

      if (search) {
        const escaped = search.replace(/[%_]/g, '\\$&');
        query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
      }
    }

    return query;
  };

  let data: any = null;
  let error: any = null;
  ({ data, error } = await runQuery(baseWithOwner).range(offset, rangeEnd));

  if (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const code = typeof error?.code === 'string' ? error.code : '';
    if (message.toLowerCase().includes('owner_user_id') || code === '42703') {
      ({ data, error } = await runQuery(baseWithoutOwner).range(offset, rangeEnd));
    }
  }

  if (error) {
    console.error('Failed to load sponsor stores', error);
    return [];
  }

  return (data ?? []).map((row: SponsorStoreRow) => mapStore(row as unknown as SponsorStoreRow));
}

export async function listTopSponsorOffers(options: {
  city?: string | null;
  limit?: number;
} = {}): Promise<SponsorOffer[]> {
  const supabase = await getSupabase();
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 8;
  const city = typeof options.city === 'string' ? options.city.trim().toLowerCase() : '';

  let query = supabase
    .from('sponsor_offers')
    .select(
      `
      id,
      store_id,
      title,
      description,
      discount_type,
      discount_value,
      currency,
      end_at,
      sponsor_stores!inner(
        id,
        name,
        slug,
        logo_url,
        primary_city,
        phone,
        whatsapp,
        website
      )
    `,
    )
    .eq('is_featured', true)
    .eq('status', 'active')
    .order('end_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (city && city !== 'all') {
    query = query.eq('sponsor_stores.primary_city', city);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load top sponsor offers', error);
    return [];
  }

  return (data ?? []).map((row) => mapOffer(row as unknown as SponsorOfferRow));
}

export async function getSponsorStoreBySlug(slug: string): Promise<SponsorStoreDetails | null> {
  const supabase = await getSupabase();
  const normalized = (slug ?? '').trim().toLowerCase();
  if (!normalized) return null;

  const selectWithOwner = `
      id,
      name,
      slug,
      description,
      logo_url,
      cover_url,
      primary_city,
      phone,
      whatsapp,
      website,
      owner_user_id,
      sponsor_tier,
      is_featured,
      updated_at,
      sponsor_store_locations (
        id,
        city,
        address,
        lat,
        lng,
        phone,
        is_primary
      ),
      sponsor_store_categories (
        category:categories (
          id,
          name,
          name_ar,
          name_ku,
          icon
        )
      )
    `;
  const selectWithoutOwner = `
      id,
      name,
      slug,
      description,
      logo_url,
      cover_url,
      primary_city,
      phone,
      whatsapp,
      website,
      sponsor_tier,
      is_featured,
      updated_at,
      sponsor_store_locations (
        id,
        city,
        address,
        lat,
        lng,
        phone,
        is_primary
      ),
      sponsor_store_categories (
        category:categories (
          id,
          name,
          name_ar,
          name_ku,
          icon
        )
      )
    `;

  let data: any = null;
  let error: any = null;
  ({ data, error } = await supabase.from('sponsor_stores').select(selectWithOwner).eq('slug', normalized).maybeSingle());

  if (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const code = typeof error?.code === 'string' ? error.code : '';
    if (message.toLowerCase().includes('owner_user_id') || code === '42703') {
      ({ data, error } = await supabase
        .from('sponsor_stores')
        .select(selectWithoutOwner)
        .eq('slug', normalized)
        .maybeSingle());
    }
  }

  if (error) {
    console.error('Failed to load sponsor store by slug', error);
    return null;
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as SponsorStoreRow & {
    sponsor_store_locations?: SponsorStoreLocationRow[] | null;
    sponsor_store_categories?: SponsorStoreCategoryLinkRow[] | null;
  };

  const store = mapStore(row);
  const locations = (row.sponsor_store_locations ?? []).map((item) => mapLocation(item));
  const categories = (row.sponsor_store_categories ?? [])
    .map((item) => mapCategoryLink(item))
    .filter((item): item is SponsorStoreCategory => Boolean(item));

  locations.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return {
    ...store,
    locations,
    categories,
  };
}

export async function listSponsorOffersByStoreId(storeId: string, limit = 20): Promise<SponsorOffer[]> {
  const supabase = await getSupabase();
  if (!storeId) return [];
  const boundedLimit = limit > 0 ? Math.min(limit, 50) : 20;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('sponsor_offers')
    .select('id, store_id, title, description, discount_type, discount_value, currency, end_at')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .lte('start_at', nowIso)
    .or(`end_at.is.null,end_at.gt.${nowIso}`)
    .order('is_featured', { ascending: false })
    .order('end_at', { ascending: true, nullsFirst: false })
    .limit(boundedLimit);

  if (error) {
    console.error('Failed to load sponsor offers for store', error);
    return [];
  }

  return (data ?? []).map((row) => mapOffer(row as unknown as SponsorOfferRow));
}

export async function getSponsorOfferById(offerId: string): Promise<SponsorOfferDetails | null> {
  const supabase = await getSupabase();
  const id = (offerId ?? '').trim();
  if (!id) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('sponsor_offers')
    .select(
      `
      id,
      store_id,
      title,
      description,
      terms,
      start_at,
      discount_type,
      discount_value,
      currency,
      end_at,
      sponsor_stores!inner(
        id,
        name,
        slug,
        logo_url,
        primary_city,
        phone,
        whatsapp,
        website
      )
    `,
    )
    .eq('id', id)
    .eq('status', 'active')
    .lte('start_at', nowIso)
    .or(`end_at.is.null,end_at.gt.${nowIso}`)
    .maybeSingle();

  if (error) {
    console.error('Failed to load sponsor offer by id', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapOfferDetails(data as unknown as SponsorOfferRow);
}
