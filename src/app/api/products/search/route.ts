import { NextResponse } from 'next/server';

import { getProductsWithCount, searchProducts, type ProductFilters } from '@/lib/services/products';
import { parseProductQueryParams, postedWithinToDate } from '@/lib/products/filter-params';
import { withSentryRoute } from '@/utils/sentry-route';

const PAGE_SIZE = 24;

export const GET = withSentryRoute(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const entries: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => {
    entries[key] = value;
  });

  const { filters, sort, postedWithin, page } = parseProductQueryParams(entries);
  const offset = (page - 1) * PAGE_SIZE;
  const createdAfter = postedWithinToDate(postedWithin);

  const filtersWithDate: ProductFilters = {
    ...filters,
    createdAfter,
  };

  const shouldUseEdgeSearch = Boolean(filters.search) && postedWithin === 'any';

  const result = shouldUseEdgeSearch
    ? await searchProducts(filtersWithDate, PAGE_SIZE, offset, sort)
    : await getProductsWithCount(filtersWithDate, PAGE_SIZE, offset, sort);

  const response = NextResponse.json({ items: result.items, count: result.count, page });
  // Cache for a short time on shared caches; allow SWR for clients
  response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  return response;
});
