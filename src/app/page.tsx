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
import { PartnershipInquiry } from '@/components/marketing/partnership-inquiry';
import Link from 'next/link';
import Image from 'next/image';
import SwipeHint from '@/components/ui/swipe-hint';
import {
  CATEGORY_UI_CONFIG,
  CATEGORY_ICON_MAP,
  CATEGORY_LABEL_MAP,
  CATEGORY_BLUR_PLACEHOLDER,
} from '@/data/category-ui-config';
import { getServerLocale } from '@/lib/locale/server';
import { LocaleMessages, rtlLocales, translations } from '@/lib/locale/dictionary';

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
  const categoriesDirection = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const createdAfter = postedWithinToDate(postedWithin);

  const filtersWithDate = {
    ...filters,
    createdAfter,
  };

  const shouldUseEdgeSearch = Boolean(filters.search) && postedWithin === 'any';

  const productPromise = shouldUseEdgeSearch
    ? searchProducts(filtersWithDate, 30, 0, sort).then((result) => result.items)
    : getProducts(filtersWithDate, 30, 0, sort);

  const [products, categoriesRaw, locations] = await Promise.all([
    productPromise,
    getCachedCategories(),
    getCachedLocations(),
  ]);

  // Map backend categories to a unique, ordered set based on CATEGORY_UI_CONFIG.
  // This guarantees we only show each logical category (e.g. Cars) once even if
  // multiple backend rows (Cars, Motors, Vehicles) map to the same concept.
  const categories = CATEGORY_UI_CONFIG.map((config) => {
    const match = categoriesRaw.find((category) => {
      const nameLc = (category.name || '').toLowerCase();
      return config.matchNames.some((matchName) => matchName === nameLc);
    });
    return match ?? null;
  }).filter((category): category is (typeof categoriesRaw)[number] => Boolean(category));

  const viewParams = createProductsSearchParams(initialValues);
  const viewAllHref = viewParams.toString() ? `/products?${viewParams.toString()}` : '/products';

  return (
    <>
      <section className="py-1 bg-linear-to-b from-white to-[#fff4e5]">
        <div className="container mx-auto px-4 space-y-1">
          {categories.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {messages.homepage.noCategories}
            </span>
          ) : (
            <SwipeHint
              label={messages.homepage.swipeHint}
              direction={categoriesDirection}
              containerClassName="no-scrollbar flex gap-1 overflow-x-auto pb-1 snap-x snap-proximity scroll-px-4 [-webkit-overflow-scrolling:touch] overscroll-x-contain touch-pan-x lg:gap-1.5 lg:overflow-visible lg:justify-center"
            >
              {categories.map((category, idx) => {
                const baseName = category.name ?? '';
                const baseNameLc = baseName.toLowerCase();
                const configForCategory = CATEGORY_LABEL_MAP[baseNameLc];
                const localizedLabel =
                  locale === 'ar'
                    ? category.nameAr || configForCategory?.labelAr || configForCategory?.label || baseName
                    : locale === 'ku'
                      ? category.nameKu || configForCategory?.labelKu || configForCategory?.label || baseName
                      : configForCategory?.label || baseName;
                const label = localizedLabel;
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
                const categoryKey = (category.name || '').toLowerCase();
                const isCars = categoryKey.includes('car');
                const isFashion = categoryKey.includes('fashion');
                const isSports = categoryKey.includes('sport');
                const isKidsToys = categoryKey.includes('kids') || categoryKey.includes('toy');
                const isFurniture = categoryKey.includes('furniture');
                const isFreeLabel = labelLc.includes('free') || labelLc.includes('مجاني') || labelLc.includes('بێبەرامبەر');
                const isCarsOrFashion = isCars || isFashion;
                const needsExtraZoom = isFashion || isSports;

                // Decide how to render the icon: PNG from public/ or emoji fallback
                const mapped = CATEGORY_ICON_MAP[(category.name || '').toLowerCase()] ?? '';
                const rawIcon = typeof category.icon === 'string' ? category.icon.trim() : '';
                const isDbImage = rawIcon && /\.(png|webp|jpg|jpeg|gif|svg)$/i.test(rawIcon);
                const iconPath = isDbImage ? rawIcon : mapped;
                const isLocalImage =
                  iconPath &&
                  !/^https?:\/\//i.test(iconPath) &&
                  /\.(png|webp|jpg|jpeg|gif|svg)$/i.test(iconPath);
                const normalizedSrc = isLocalImage ? (iconPath.startsWith('/') ? iconPath : `/${iconPath}`) : '';

                return (
                  <Link
                    href={categoryHref}
                    key={category.id}
                    aria-label={label}
                    className="snap-start inline-flex shrink-0 w-[6.1rem] sm:w-24 md:w-[5.8rem] lg:w-22 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] sm:text-sm font-medium text-foreground/90 transition hover:bg-muted/60 active:scale-[0.99] md:snap-normal"
                  >
                    <span
                      className="relative inline-flex h-[3.6rem] w-[3.6rem] sm:h-14 sm:w-14 md:h-16 md:w-16 items-center justify-center overflow-hidden bg-white rounded-[18px]"
                      aria-hidden="true"
                    >
                      {isLocalImage ? (
                        <Image
                          src={normalizedSrc}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 80px, 96px"
                          className={
                            isKidsToys
                              ? 'object-cover scale-[2.3] -translate-y-0.5'
                            : isFurniture
                              ? 'object-cover scale-[2.1] -translate-y-0.5'
                            : isFreeLabel
                              ? 'object-cover scale-[2] translate-y-0.5'
                              : needsExtraZoom
                              ? 'object-cover scale-[2.2]'
                              : isCarsOrFashion
                              ? 'object-cover scale-[1.9]'
                              : 'object-cover scale-[1.8]'
                          }
                          priority={idx < 4}
                          loading={idx < 4 ? 'eager' : 'lazy'}
                          quality={75}
                          placeholder="blur"
                          blurDataURL={CATEGORY_BLUR_PLACEHOLDER}
                          unoptimized={false}
                        />
                      ) : (
                        <span className={`${color.iconText} text-base sm:text-lg`}>{category.icon ?? '🏷️'}</span>
                      )}
                    </span>
                    <span className="mt-1 text-center leading-tight">{label}</span>
                  </Link>
                );
              })}
            </SwipeHint>
          )}
        </div>
      </section>

      <section id="products" className="pt-2 pb-10 bg-accent">
        <div className="container mx-auto px-4 space-y-3">
          <ProductsFilterBar
            categories={categories}
            locations={locations}
            initialValues={initialValues}
            targetPath="/"
            showCategorySelect={false}
            priceInputMode="select"
          />

          <div className="flex items-center justify-between mb-2">
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
              <ProductCard key={product.id} product={product} viewerId={viewerId} searchQuery={initialValues.search} />
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
              {messages.homepage.faqSubtitle}
            </p>
            <div>
              <Link href="/faq" className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-primary-foreground font-semibold hover:bg-primary/90">
                {messages.homepage.faqCta}
              </Link>
            </div>
          </div>
        </section>

        <section className="py-12 bg-primary text-white">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-white/10 p-6 text-center shadow-sm md:p-8 md:text-start">
                <h2 className="text-2xl md:text-3xl font-bold mb-4">
                  {messages.homepage.subscribeTitle}
                </h2>
                <p className="mb-6 opacity-90">
                  {messages.homepage.subscribeDescription}
                </p>
                <NewsletterSignup className="md:mx-0" />
              </div>
              <div className="rounded-3xl bg-white/10 p-6 text-center shadow-sm md:p-8 md:text-start">
                <h2 className="text-2xl md:text-3xl font-bold mb-3">
                  {messages.partnership.title}
                </h2>
                <p className="opacity-90">
                  {messages.partnership.subtitle}
                </p>
                <p className="mt-3 text-sm opacity-85">
                  {messages.partnership.audience}
                </p>
                <p className="text-sm opacity-85">
                  {messages.partnership.responseTime}
                </p>
                <PartnershipInquiry className="mt-6 md:items-start" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

