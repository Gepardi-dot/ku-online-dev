import { z } from 'zod';

import type { ProductFilters, ProductSort } from '@/lib/services/products';

export const PRODUCT_SORT_VALUES = ['newest', 'price_asc', 'price_desc', 'views_desc'] as const;
export const POSTED_WITHIN_VALUES = ['any', '24h', '7d', '30d'] as const;
export const CONDITION_VALUES = ['New', 'Used - Like New', 'Used - Good', 'Used - Fair'] as const;

export type PostedWithin = (typeof POSTED_WITHIN_VALUES)[number];
export type ConditionValue = (typeof CONDITION_VALUES)[number];

const productSortEnum = z.enum(PRODUCT_SORT_VALUES);
const postedWithinEnum = z.enum(POSTED_WITHIN_VALUES);
const conditionEnum = z.enum(CONDITION_VALUES);

export interface ProductsFilterValues {
  search: string;
  category: string;
  condition: '' | ConditionValue;
  location: string;
  minPrice: string;
  maxPrice: string;
  sort: ProductSort;
  postedWithin: PostedWithin;
  freeOnly?: boolean;
}

export const DEFAULT_FILTER_VALUES: ProductsFilterValues = {
  search: '',
  category: '',
  condition: '',
  location: '',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
  postedWithin: 'any',
  freeOnly: false,
};

export const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Conditions' },
  ...CONDITION_VALUES.map((value) => ({ value, label: value })),
];

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'views_desc', label: 'Most Viewed' },
];

export const POSTED_WITHIN_OPTIONS: { value: PostedWithin; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export function parseSortParam(value?: string): ProductSort {
  const parsed = productSortEnum.safeParse(value);
  return parsed.success ? parsed.data : 'newest';
}

export function parsePriceParam(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

export function parsePostedWithinParam(value?: string): PostedWithin {
  const parsed = postedWithinEnum.safeParse(value);
  if (parsed.success && parsed.data !== 'any') {
    return parsed.data;
  }
  return 'any';
}

export function postedWithinToDate(postedWithin: PostedWithin): string | undefined {
  const now = new Date();

  switch (postedWithin) {
    case '24h': {
      const date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return date.toISOString();
    }
    case '7d': {
      const date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date.toISOString();
    }
    case '30d': {
      const date = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return date.toISOString();
    }
    case 'any':
    default:
      return undefined;
  }
}

const productQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  location: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  sort: z.string().optional(),
  postedWithin: z.string().optional(),
  free: z.string().optional(),
  page: z.string().optional(),
}).transform((value) => {
  const entries: Record<string, string | undefined> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      entries[key] = trimmed.length > 0 ? trimmed : undefined;
    }
  }
  return entries;
});

export interface ParsedProductQuery {
  initialValues: ProductsFilterValues;
  filters: ProductFilters;
  sort: ProductSort;
  postedWithin: PostedWithin;
  page: number;
  minPrice?: number;
  maxPrice?: number;
}

export function parseProductQueryParams(
  params: Record<string, string | undefined> | undefined,
): ParsedProductQuery {
  const result = productQuerySchema.safeParse(params ?? {});
  const data = result.success ? result.data : {};

  const search = data.search ?? '';
  const category = data.category;
  const condition = data.condition;
  const location = data.location ?? '';
  const sort = parseSortParam(data.sort);
  const postedWithin = parsePostedWithinParam(data.postedWithin);
  const pageValue = data.page ? Number(data.page) : NaN;
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;

  const minPrice = parsePriceParam(data.minPrice);
  const maxPrice = parsePriceParam(data.maxPrice);
  const freeOnly = typeof data.free === 'string' && ['1','true','yes','free'].includes(data.free.toLowerCase());

  const validCategory =
    typeof category === 'string' && z.string().uuid().safeParse(category).success ? category : '';
  const validCondition =
    typeof condition === 'string' && conditionEnum.safeParse(condition).success
      ? (condition as ConditionValue)
      : undefined;

  const initialValues: ProductsFilterValues = {
    search,
    category: validCategory,
    condition: validCondition ?? '',
    location,
    minPrice: minPrice !== undefined ? String(minPrice) : '',
    maxPrice: maxPrice !== undefined ? String(maxPrice) : '',
    sort,
    postedWithin,
    freeOnly,
  };

  const filters: ProductFilters = {
    category: validCategory || undefined,
    condition: validCondition,
    location: location || undefined,
    search: search ? search : undefined,
    minPrice,
    maxPrice,
    freeOnly: freeOnly || undefined,
  };

  return {
    initialValues,
    filters,
    sort,
    postedWithin,
    page,
    minPrice,
    maxPrice,
  };
}

export function createProductsSearchParams(
  base: ProductsFilterValues,
  overrides: Record<string, string | number | undefined> = {},
): URLSearchParams {
  const params = new URLSearchParams();

  const trimmedSearch = base.search.trim();
  if (trimmedSearch) {
    params.set('search', trimmedSearch);
  }

  if (base.category) {
    params.set('category', base.category);
  }

  if (base.condition) {
    params.set('condition', base.condition);
  }

  if (base.location) {
    params.set('location', base.location);
  }

  if (base.minPrice.trim()) {
    params.set('minPrice', base.minPrice.trim());
  }

  if (base.maxPrice.trim()) {
    params.set('maxPrice', base.maxPrice.trim());
  }

  if (base.sort && base.sort !== 'newest') {
    params.set('sort', base.sort);
  }

  if (base.postedWithin && base.postedWithin !== 'any') {
    params.set('postedWithin', base.postedWithin);
  }

  if (base.freeOnly) {
    params.set('free', '1');
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  return params;
}

export function buildProductsQueryString(
  base: ProductsFilterValues,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const params = createProductsSearchParams(base, overrides);
  const query = params.toString();
  return query ? `/products?${query}` : '/products';
}
