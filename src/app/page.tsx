
import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight } from 'lucide-react';

import AppLayout from '@/components/layout/app-layout';
import ProductCard from '@/components/product-card-new';
import { ProductsFilterBar } from '@/components/products/filter-bar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/server';
import {
  getProducts,
  getCategories,
  getAvailableLocations,
  searchProducts,
} from '@/lib/services/products';
import {
  DEFAULT_FILTER_VALUES,
  parsePostedWithinParam,
  parsePriceParam,
  parseSortParam,
  postedWithinToDate,
  type ProductsFilterValues,
} from '@/lib/products/filter-params';
import { NewsletterSignup } from '@/components/marketing/newsletter-signup';
import { getServerLocale } from '@/lib/locale/server';
import { LocaleMessages, translations } from '@/lib/locale/dictionary';

interface SearchPageParams {
  category?: string;
  condition?: string;
  location?: string;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  postedWithin?: string;
}

interface SearchPageProps {
  searchParams: Promise<SearchPageParams>;
}

interface ProductsListProps {
  searchParams: Promise<SearchPageParams>;
  messages: LocaleMessages;
  viewerId?: string | null;
}

function buildHomepageQuery(values: ProductsFilterValues) {
  const params = new URLSearchParams();

  const entries: Record<string, string> = {
    category: values.category,
    condition: values.condition,
    location: values.location,
    minPrice: values.minPrice.trim(),
    maxPrice: values.maxPrice.trim(),
    sort: values.sort !== 'newest' ? values.sort : '',
    postedWithin: values.postedWithin !== 'any' ? values.postedWithin : '',
  };

  const searchValue = values.search.trim();
  if (searchValue) {
    params.set('search', searchValue);
  }

  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

async function ProductsList({ searchParams, messages, viewerId }: ProductsListProps) {
  const params = await searchParams;

  const sort = parseSortParam(params.sort);
  const minPrice = parsePriceParam(params.minPrice);
  const maxPrice = parsePriceParam(params.maxPrice);
  const postedWithin = parsePostedWithinParam(params.postedWithin);
  const createdAfter = postedWithinToDate(postedWithin);

  const trimmedSearch = params.search?.trim() ?? '';
  const searchFilter = trimmedSearch ? trimmedSearch : undefined;
  const shouldUseEdgeSearch = Boolean(searchFilter) && postedWithin === 'any';

  const filters = {
    category: params.category,
    condition: params.condition,
    location: params.location,
    search: searchFilter,
    minPrice,
    maxPrice,
    createdAfter,
  };

  const productPromise = shouldUseEdgeSearch
    ? searchProducts(filters, 30, 0, sort).then((result) => result.items)
    : getProducts(filters, 30, 0, sort);

  const [products, categories, locations] = await Promise.all([
    productPromise,
    getCategories(),
    getAvailableLocations(),
  ]);

  const initialValues: ProductsFilterValues = {
    ...DEFAULT_FILTER_VALUES,
    search: params.search ?? DEFAULT_FILTER_VALUES.search,
    category: params.category ?? DEFAULT_FILTER_VALUES.category,
    condition: params.condition ?? DEFAULT_FILTER_VALUES.condition,
    location: params.location ?? DEFAULT_FILTER_VALUES.location,
    minPrice: params.minPrice ?? DEFAULT_FILTER_VALUES.minPrice,
    maxPrice: params.maxPrice ?? DEFAULT_FILTER_VALUES.maxPrice,
    sort,
    postedWithin,
  };

  const viewAllHref = buildHomepageQuery(initialValues).replace(/^\//, '/products');

  return (
    <>
      <section className="py-4 bg-white border-b">
        <div className="container mx-auto px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">
              {messages.homepage.categoriesLabel}
            </h3>
            <Link
              href={viewAllHref}
              className="text-sm font-medium text-primary hover:underline"
            >
              {messages.homepage.viewAll}
            </Link>
          </div>

          {categories.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {messages.homepage.noCategories}
            </span>
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => {
                const categoryHref = buildHomepageQuery({ ...initialValues, category: category.id });
                return (
                  <Link
                    href={categoryHref}
                    key={category.id}
                    className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-transparent bg-white px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary"
                  >
                    <span className="text-base leading-none">
                      {category.icon ?? '🛍️'}
                    </span>
                    <span className="whitespace-nowrap">{category.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section id="products" className="pt-6 pb-12 bg-accent">
        <div className="container mx-auto px-4 space-y-6">
          <ProductsFilterBar
            categories={categories}
            locations={locations}
            initialValues={initialValues}
            targetPath="/"
            showSearchInput={false}
            showCategorySelect={false}
            priceInputMode="select"
          />

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl md:text-3xl font-bold">
              {messages.homepage.latest}
            </h2>
            <Button asChild variant="link" className="text-primary font-semibold">
              <Link href={viewAllHref}>
                {messages.homepage.viewAll}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} viewerId={viewerId} />
            ))}
          </div>

          {products.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {messages.homepage.noProducts}
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default async function MarketplacePage({ searchParams }: SearchPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getServerLocale();
  const messages = translations[locale];

  return (
    <AppLayout user={user}>
      <div className="flex flex-col">
        <Suspense
          fallback={
            <div className="container mx-auto px-4 py-12 text-center">
              {messages.common.loading}
            </div>
          }
        >
          <ProductsList searchParams={searchParams} messages={messages} viewerId={user?.id ?? null} />
        </Suspense>

        <section className="py-12 bg-gray-50">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
              {messages.homepage.faqTitle}
            </h2>
            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="w-full">
                {messages.homepage.faq.map((item, index) => (
                  <AccordionItem value={`faq-${index}`} key={item.question}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent>{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        <section className="py-12 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              {messages.homepage.subscribeTitle}
            </h2>
            <p className="mb-6 max-w-2xl mx-auto opacity-90">
              {messages.homepage.subscribeDescription}
            </p>
            <NewsletterSignup />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
