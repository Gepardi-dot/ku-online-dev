import { Suspense } from 'react';
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
import { getProducts, searchProducts } from '@/lib/services/products';
import { getCachedCategories, getCachedLocations } from '@/lib/services/products-cache';
import {
  DEFAULT_FILTER_VALUES,
  parseProductQueryParams,
  postedWithinToDate,
  type ProductsFilterValues,
  createProductsSearchParams,
} from '@/lib/products/filter-params';
import ProductGridSkeleton from '@/components/products/ProductGridSkeleton';
import { NewsletterSignup } from '@/components/marketing/newsletter-signup';
import Link from 'next/link';
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
  const { initialValues, filters, sort, postedWithin } = parseProductQueryParams(
    params as unknown as Record<string, string | undefined>,
  );
  const locale = await getServerLocale();
  const isRTL = locale === 'ar' || locale === 'ku';
  const createdAfter = postedWithinToDate(postedWithin);

  const filtersWithDate = {
    ...filters,
    createdAfter,
  };

  const shouldUseEdgeSearch = Boolean(filters.search) && postedWithin === 'any';

  const productPromise = shouldUseEdgeSearch
    ? searchProducts(filtersWithDate, 30, 0, sort).then((result) => result.items)
    : getProducts(filtersWithDate, 30, 0, sort);

  const [products, categories, locations] = await Promise.all([
    productPromise,
    getCachedCategories(),
    getCachedLocations(),
  ]);

  const viewParams = createProductsSearchParams(initialValues);
  const viewAllHref = viewParams.toString() ? `/products?${viewParams.toString()}` : '/products';

  return (
    <>
      <section className="py-2 bg-white border-b">
        <div className="container mx-auto px-4 space-y-2">
          <div className="flex items-center justify-end">
            <Link href={viewAllHref} className="text-sm font-medium text-primary hover:underline">
              {messages.homepage.viewAll}
            </Link>
          </div>

          {categories.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {messages.homepage.noCategories}
            </span>
          ) : (
            <div className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory ${isRTL ? 'flex-row-reverse' : ''}`}>
              {categories.map((category, idx) => {
                const label = locale === 'ar' && category.nameAr
                  ? category.nameAr
                  : locale === 'ku' && category.nameKu
                  ? category.nameKu
                  : category.name;
                const labelLc = (label ?? '').toLowerCase();
                const isFree = ['free', 'مجاني', 'مجانا', 'فري', 'بلاش'].some((kw) => labelLc.includes(kw));
                const params = isFree
                  ? createProductsSearchParams({ ...initialValues, category: '', freeOnly: true })
                  : createProductsSearchParams({ ...initialValues, category: category.id, freeOnly: false });
                const qs = params.toString();
                const categoryHref = qs ? `/products?${qs}` : '/products';

                const swatches = [
                  { iconBg: 'from-pink-500/10 to-rose-500/10', iconText: 'text-rose-600' },
                  { iconBg: 'from-violet-500/10 to-indigo-500/10', iconText: 'text-violet-600' },
                  { iconBg: 'from-emerald-500/10 to-teal-500/10', iconText: 'text-emerald-600' },
                  { iconBg: 'from-amber-500/10 to-orange-500/10', iconText: 'text-amber-600' },
                  { iconBg: 'from-sky-500/10 to-cyan-500/10', iconText: 'text-sky-600' },
                  { iconBg: 'from-fuchsia-500/10 to-pink-500/10', iconText: 'text-fuchsia-600' },
                ];
                const color = swatches[idx % swatches.length];

                return (
                  <Link
                    href={categoryHref}
                    key={category.id}
                    aria-label={label}
                    className="snap-start inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs sm:text-sm font-medium text-foreground/90 transition hover:bg-muted/60 active:scale-[0.99]"
                  >
                    <span
                      className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-gradient-to-br ${color.iconBg} ${color.iconText} text-base sm:text-lg shadow-sm`}
                      aria-hidden="true"
                    >
                      {category.icon ?? '🏷️'}
                    </span>
                    <span className="whitespace-nowrap hidden sm:inline">{label}</span>
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
            <div className="container mx-auto px-4 py-6">
              <ProductGridSkeleton count={12} />
            </div>
          }
        >
          <ProductsList searchParams={searchParams} messages={messages} viewerId={user?.id ?? null} />
        </Suspense>

        <section className="py-12 bg-gray-50">
          <div className="container mx-auto px-4 text-center space-y-4">
            <h2 className="text-2xl md:text-3xl font-bold">{messages.homepage.faqTitle}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Buying and selling is arranged directly between users. Read our quick tips and safety guidance before you meet.
            </p>
            <div>
              <Link href="/faq" className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-primary-foreground font-semibold hover:bg-primary/90">
                Read FAQs
              </Link>
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









