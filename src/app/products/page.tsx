import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import AppLayout from '@/components/layout/app-layout';
import ProductCard from '@/components/product-card-new';
import { ProductsFilterBar, type ProductsFilterValues } from '@/components/products/filter-bar';
import {
  getProductsWithCount,
  getCategories,
  getAvailableLocations,
  type ProductFilters,
  type ProductSort,
} from '@/lib/services/products';
import { Button } from '@/components/ui/button';

interface ProductsSearchParams {
  page?: string;
  search?: string;
  category?: string;
  condition?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
}

interface ProductsPageProps {
  searchParams: Promise<ProductsSearchParams>;
}

interface ProductsContentProps {
  searchParams: Promise<ProductsSearchParams>;
  categories: { id: string; name: string }[];
  locations: string[];
}

const PAGE_SIZE = 24;

const DEFAULT_FILTERS: ProductsFilterValues = {
  search: '',
  category: '',
  condition: '',
  location: '',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
};

function parseSort(value: string | undefined): ProductSort {
  if (value === 'price_asc' || value === 'price_desc' || value === 'views_desc' || value === 'newest') {
    return value;
  }
  return 'newest';
}

function parsePrice(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function buildQueryString(base: ProductsFilterValues, overrides: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();

  const entries: Record<string, string> = {
    search: base.search.trim(),
    category: base.category,
    condition: base.condition,
    location: base.location,
    minPrice: base.minPrice.trim(),
    maxPrice: base.maxPrice.trim(),
  };

  const sortValue = base.sort;
  if (sortValue && sortValue !== 'newest') {
    params.set('sort', sortValue);
  }

  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      params.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `/products?${query}` : '/products';
}

async function ProductsContent({ searchParams, categories, locations }: ProductsContentProps) {
  const params = await searchParams;

  const pageParam = params.page ? Number(params.page) : 1;
  const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const sort = parseSort(params.sort);
  const minPrice = parsePrice(params.minPrice);
  const maxPrice = parsePrice(params.maxPrice);

  const filters: ProductFilters = {
    category: params.category || undefined,
    condition: params.condition || undefined,
    location: params.location || undefined,
    search: params.search ? params.search.trim() : undefined,
    minPrice,
    maxPrice,
  };

  const { items, count } = await getProductsWithCount(filters, PAGE_SIZE, offset, sort);

  const boundedPage = count === 0 ? 1 : Math.min(currentPage, Math.max(1, Math.ceil(count / PAGE_SIZE)));
  const displayOffset = boundedPage === currentPage ? offset : (boundedPage - 1) * PAGE_SIZE;

  const initialValues: ProductsFilterValues = {
    search: params.search ?? DEFAULT_FILTERS.search,
    category: params.category ?? DEFAULT_FILTERS.category,
    condition: params.condition ?? DEFAULT_FILTERS.condition,
    location: params.location ?? DEFAULT_FILTERS.location,
    minPrice: params.minPrice ?? DEFAULT_FILTERS.minPrice,
    maxPrice: params.maxPrice ?? DEFAULT_FILTERS.maxPrice,
    sort,
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const showFrom = count === 0 ? 0 : displayOffset + 1;
  const showTo = count === 0 ? 0 : Math.min(displayOffset + items.length, count);

  const prevPage = boundedPage > 1 ? boundedPage - 1 : null;
  const nextPage = boundedPage < totalPages ? boundedPage + 1 : null;

  const baseForQuery: ProductsFilterValues = {
    ...initialValues,
    minPrice: minPrice !== undefined ? String(minPrice) : '',
    maxPrice: maxPrice !== undefined ? String(maxPrice) : '',
  };

  return (
    <section className="py-12">
      <div className="container mx-auto px-4 space-y-6">
        <ProductsFilterBar categories={categories} locations={locations} initialValues={baseForQuery} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">All Listings</h1>
            <p className="text-muted-foreground">
              {count === 0
                ? 'No listings match your filters yet. Try adjusting your search.'
                : `Showing ${showFrom}-${showTo} of ${count} listing${count === 1 ? '' : 's'}.`}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            No listings available yet. Check back soon!
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-4">
            <div className="text-sm text-muted-foreground">
              Page {boundedPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" disabled={!prevPage}>
                <Link href={prevPage ? buildQueryString(baseForQuery, { page: prevPage.toString() }) : '#'}>Previous</Link>
              </Button>
              <Button asChild variant="outline" size="sm" disabled={!nextPage}>
                <Link href={nextPage ? buildQueryString(baseForQuery, { page: nextPage.toString() }) : '#'}>Next</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  const [categories, locations] = await Promise.all([
    getCategories(),
    getAvailableLocations(),
  ]);

  const categoryOptions = categories.map((category) => ({ id: category.id, name: category.name }));

  return (
    <AppLayout user={user}>
      <Suspense fallback={<div className="container mx-auto px-4 py-12 text-center">Loading listings...</div>}>
        <ProductsContent searchParams={searchParams} categories={categoryOptions} locations={locations} />
      </Suspense>
    </AppLayout>
  );
}

