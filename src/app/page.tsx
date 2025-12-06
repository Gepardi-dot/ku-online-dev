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
import Image from 'next/image';

type CategoryUiConfig = {
  key: string;
  label: string;
  labelAr?: string;
  labelKu?: string;
  icon: string;
  matchNames: string[];
};

const CATEGORY_UI_CONFIG: CategoryUiConfig[] = [
  {
    key: 'smartphones-ipads',
    label: 'Smartphones and iPads',
    labelAr: 'الهواتف والأيباد',
    labelKu: 'مۆبایل و ئایپاد',
    icon: '/Smartphones and ipads.png',
    matchNames: ['smartphones and ipads', 'smartphones', 'smartphone'],
  },
  {
    key: 'fashion',
    label: 'Fashion',
    labelAr: 'أزياء',
    labelKu: 'فەشن',
    icon: '/Fashion (2) (1).png',
    matchNames: ['fashion'],
  },
  {
    key: 'electronics',
    label: 'Electronics',
    labelAr: 'إلكترونيات',
    labelKu: 'ئێلێکترۆنیات',
    icon: '/Electronics (1).png',
    matchNames: ['electronics'],
  },
  {
    key: 'sports',
    label: 'Sports',
    labelAr: 'رياضة',
    labelKu: 'وەرزشی',
    icon: '/Sports (2) (1).png',
    matchNames: ['sports'],
  },
  {
    key: 'home-appliance',
    label: 'Home Appliance',
    labelAr: 'أجهزة منزلية',
    labelKu: 'کەرەساتی ماڵەوە',
    icon: '/Home appliance.png',
    matchNames: ['home appliance', 'home & garden', 'home and garden'],
  },
  {
    key: 'kids-toys',
    label: 'Kids & Toys',
    labelAr: 'ألعاب الأطفال',
    labelKu: 'منداڵ و یاریەکان',
    icon: '/Kids & Toys (1).png',
    matchNames: ['kids & toys', 'kids and toys', 'toys'],
  },
  {
    key: 'furniture',
    label: 'Furniture',
    labelAr: 'أثاث',
    labelKu: 'کاڵای خانووبەرە',
    icon: '/Furniture (1).png',
    matchNames: ['furniture'],
  },
  {
    key: 'services',
    label: 'Services',
    labelAr: 'خدمات',
    labelKu: 'خزمەتگوزاری',
    icon: '/Services (1).png',
    matchNames: ['services'],
  },
  {
    key: 'cars',
    label: 'Cars',
    labelAr: 'سيارات',
    labelKu: 'ئۆتۆمبێل',
    icon: '/Cars (2) (1).png',
    matchNames: ['cars', 'motors', 'vehicles'],
  },
  {
    key: 'property',
    label: 'Property',
    labelAr: 'عقارات',
    labelKu: 'خانوو',
    icon: '/Property.png',
    matchNames: ['property', 'real estate'],
  },
  {
    key: 'free',
    label: 'Free',
    labelAr: 'مجاني',
    labelKu: 'بێبەرامبەر',
    icon: '/Free (2) (1).png',
    matchNames: ['free'],
  },
  {
    key: 'others',
    label: 'Others',
    labelAr: 'أخرى',
    labelKu: 'هیتر',
    icon: '/Others (2) (1).png',
    matchNames: ['others'],
  },
];

const CATEGORY_ICON_MAP: Record<string, string> = CATEGORY_UI_CONFIG.reduce(
  (acc, config) => {
    for (const name of config.matchNames) {
      acc[name.toLowerCase()] = config.icon;
    }
    return acc;
  },
  {} as Record<string, string>,
);

const CATEGORY_LABEL_MAP: Record<string, CategoryUiConfig> = CATEGORY_UI_CONFIG.reduce(
  (acc, config) => {
    for (const name of config.matchNames) {
      acc[name.toLowerCase()] = config;
    }
    return acc;
  },
  {} as Record<string, CategoryUiConfig>,
);
const CATEGORY_BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4BwQACfsD/QwZk48AAAAASUVORK5CYII=';
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
      <section className="py-1 bg-gradient-to-b from-white to-[#fff4e5]">
        <div className="container mx-auto px-4 space-y-1">
          {categories.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {messages.homepage.noCategories}
            </span>
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory lg:gap-1 lg:overflow-visible lg:justify-center">
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
                    className="snap-start inline-flex shrink-0 w-24 lg:w-20 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium text-foreground/90 transition hover:bg-muted/60 active:scale-[0.99] md:snap-normal"
                  >
                    <span
                      className="relative inline-flex h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-16 lg:w-16 items-center justify-center overflow-hidden bg-white rounded-[18px]"
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
                          quality={82}
                          placeholder="blur"
                          blurDataURL={CATEGORY_BLUR_PLACEHOLDER}
                        />
                      ) : (
                        <span className={`${color.iconText} text-base sm:text-lg`}>{category.icon ?? '🏷️'}</span>
                      )}
                    </span>
                    <span className="mt-1 text-center leading-tight">{label}</span>
                  </Link>
                );
              })}
            </div>
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









