import type { ProductSort } from '@/lib/services/products';

export type PostedWithin = 'any' | '24h' | '7d' | '30d';

export interface ProductsFilterValues {
  search: string;
  category: string;
  condition: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  sort: ProductSort;
  postedWithin: PostedWithin;
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
};

export const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Conditions' },
  { value: 'New', label: 'New' },
  { value: 'Used - Like New', label: 'Used - Like New' },
  { value: 'Used - Good', label: 'Used - Good' },
  { value: 'Used - Fair', label: 'Used - Fair' },
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
  if (value === 'price_asc' || value === 'price_desc' || value === 'views_desc' || value === 'newest') {
    return value;
  }
  return 'newest';
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
  if (value === '24h' || value === '7d' || value === '30d') {
    return value;
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
