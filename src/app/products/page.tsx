import { Suspense } from 'react';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import AppLayout from '@/components/layout/app-layout';
import { ProductsFilterBar } from '@/components/products/filter-bar';
import { ProductsExplorer } from '@/components/products/ProductsExplorer';
import {
  getProductsWithCount,
  getCategories,
  getAvailableLocations,
  searchProducts,
  type ProductFilters,
} from '@/lib/services/products';
import {
  parseProductQueryParams,
  postedWithinToDate,
  type ProductsFilterValues,
} from '@/lib/products/filter-params';

interface ProductsSearchParams {
  page?: string;
  search?: string;
  category?: string;
  condition?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  postedWithin?: string;
}

interface ProductsPageProps {
  searchParams: Promise<ProductsSearchParams>;
}

interface ProductsContentProps {
  searchParams: Promise<ProductsSearchParams>;
  categories: { id: string; name: string }[];
  locations: string[];
  viewerId?: string | null;
}

const PAGE_SIZE = 24;

export async function generateMetadata({ searchParams }: { searchParams: Promise<ProductsSearchParams> }): Promise<Metadata> {
  const params = await searchParams;
  const { initialValues } = parseProductQueryParams(params as unknown as Record<string, string | undefined>);
  const bits = [] as string[];
  if (initialValues.search) bits.push(initialValues.search);
  if (initialValues.category) bits.push('Filtered');
  const title = bits.length ? `${bits.join(' • ')} – Products` : 'All Products';
  return { title };
}

async function ProductsContent({ searchParams, categories, locations, viewerId }: ProductsContentProps) {
  const params = await searchParams;
  const { initialValues, filters, sort, postedWithin, page } = parseProductQueryParams(
    params as unknown as Record<string, string | undefined>,
  );
  const currentPage = page;
  const offset = (currentPage - 1) * PAGE_SIZE;
  const createdAfter = postedWithinToDate(postedWithin);

  const filtersWithDate: ProductFilters = {
    ...filters,
    createdAfter,
  };

  const shouldUseEdgeSearch = Boolean(filters.search) && postedWithin === 'any';
  const { items, count } = shouldUseEdgeSearch
    ? await searchProducts(filtersWithDate, PAGE_SIZE, offset, sort)
    : await getProductsWithCount(filtersWithDate, PAGE_SIZE, offset, sort);

  const boundedPage = count === 0 ? 1 : Math.min(currentPage, Math.max(1, Math.ceil(count / PAGE_SIZE)));
  const displayOffset = boundedPage === currentPage ? offset : (boundedPage - 1) * PAGE_SIZE;

  const showFrom = count === 0 ? 0 : displayOffset + 1;
  const showTo = count === 0 ? 0 : Math.min(displayOffset + items.length, count);

  const baseForQuery: ProductsFilterValues = initialValues;

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
          <ProductsExplorer
            initialItems={items}
            initialPage={boundedPage}
            totalCount={count}
            pageSize={PAGE_SIZE}
            filterValues={baseForQuery}
            viewerId={viewerId}
          />
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
        <ProductsContent
          searchParams={searchParams}
          categories={categoryOptions}
          locations={locations}
          viewerId={user?.id ?? null}
        />
      </Suspense>
    </AppLayout>
  );
}

