import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe, MapPin, MessageCircle, Phone } from 'lucide-react';

import AppLayout from '@/components/layout/app-layout';
import { SponsorStoreBasketBar } from '@/components/sponsors/SponsorStoreBasketBar';
import { SponsorStoreProductCard, type SponsorStoreProductCardModel } from '@/components/sponsors/SponsorStoreProductCard';
import { SponsorStoreServiceCard } from '@/components/sponsors/SponsorStoreServiceCard';
import { SponsorStoreTabs } from '@/components/sponsors/SponsorStoreTabs';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { CATEGORY_LABEL_MAP } from '@/data/category-ui-config';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import type { Locale } from '@/lib/locale/dictionary';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { getProducts, type ProductWithRelations } from '@/lib/services/products';
import {
  getSponsorStoreBySlug,
  listSponsorOffersByStoreId,
  type SponsorOffer,
  type SponsorStoreCategory,
  type SponsorStoreLocation,
} from '@/lib/services/sponsors';
import {
  getMockProductsByStoreSlug,
  getMockSponsorOffersByStoreId,
  getMockSponsorStoreBySlug,
  type MockSponsorProductCard,
} from '@/lib/services/sponsors-mock';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/server';

const SPONSOR_CATEGORY_FALLBACK_LABELS: Record<string, { en: string; ar: string; ku: string }> = {
  'phones & accessories': {
    en: 'Phones & Accessories',
    ar: 'الهواتف والإكسسوارات',
    ku: 'مۆبایل و ئاکسسوار',
  },
  'phones and accessories': {
    en: 'Phones & Accessories',
    ar: 'الهواتف والإكسسوارات',
    ku: 'مۆبایل و ئاکسسوار',
  },
  'home & furniture': {
    en: 'Home & Furniture',
    ar: 'المنزل والأثاث',
    ku: 'ماڵ و کەلوپەل',
  },
  'home and furniture': {
    en: 'Home & Furniture',
    ar: 'المنزل والأثاث',
    ku: 'ماڵ و کەلوپەل',
  },
};

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function localizeCategoryName(value: SponsorStoreCategory, locale: Locale): string {
  const normalized = normalizeCategoryKey(value.name);
  const mapped = CATEGORY_LABEL_MAP[normalized];
  const fallback = SPONSOR_CATEGORY_FALLBACK_LABELS[normalized];

  if (locale === 'ar') {
    if (value.nameAr?.trim()) return value.nameAr;
    if (mapped?.labelAr?.trim()) return mapped.labelAr;
    if (fallback?.ar?.trim()) return fallback.ar;
    return value.name;
  }

  if (locale === 'ku') {
    if (value.nameKu?.trim()) return value.nameKu;
    if (mapped?.labelKu?.trim()) return mapped.labelKu;
    if (fallback?.ku?.trim()) return fallback.ku;
    return value.name;
  }

  if (mapped?.label?.trim()) return mapped.label;
  if (fallback?.en?.trim()) return fallback.en;
  return value.name;
}

function getInitials(name: string): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) return 'KU';
  const parts = cleaned.split(/\s+/g).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return `${first}${second}`.toUpperCase();
}

function toTelHref(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `tel:${trimmed}`;
}

function toWhatsAppHref(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '').replace(/^00/, '+').trim();
  if (!digits) return null;
  const normalized = digits.startsWith('+') ? digits.slice(1) : digits;
  if (!normalized) return null;
  return `https://wa.me/${encodeURIComponent(normalized)}`;
}

function toWebsiteHref(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function toDirectionsHref(location: SponsorStoreLocation | null, fallbackName: string): string {
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng}`)}`;
  }
  const query = location?.address?.trim() || fallbackName || 'Store';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function cityLabelFor(locale: Locale, primaryCity: string | null): string | null {
  if (!primaryCity) return null;
  const normalized = primaryCity.trim().toLowerCase();
  const match = MARKET_CITY_OPTIONS.find((option) => option.value === normalized);
  if (!match || match.value === 'all') return primaryCity;
  return serverTranslate(locale, `header.city.${match.value}`);
}

function computePercentOff(originalPrice: number | null, dealPrice: number): number | null {
  if (typeof originalPrice !== 'number' || !Number.isFinite(originalPrice)) return null;
  if (!(originalPrice > 0) || !(dealPrice >= 0) || dealPrice > originalPrice) return null;
  const pct = Math.round((1 - dealPrice / originalPrice) * 100);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return pct;
}

export default async function SponsorStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getServerLocale();
  const isRtl = locale === 'ar' || locale === 'ku';

  let store = await getSponsorStoreBySlug(slug);
  let offers: SponsorOffer[] = [];
  let ownerUserId: string | null = null;
  let products: ProductWithRelations[] = [];
  let mockProducts: MockSponsorProductCard[] = [];

  if (store) {
    offers = await listSponsorOffersByStoreId(store.id, 12);
    ownerUserId = store.ownerUserId ?? null;
    products = ownerUserId ? await getProducts({ sellerId: ownerUserId }, 12, 0, 'newest') : [];
  } else if (process.env.NODE_ENV !== 'production') {
    const mockStore = getMockSponsorStoreBySlug(slug);
    if (!mockStore) {
      notFound();
    }
    store = mockStore;
    offers = getMockSponsorOffersByStoreId(mockStore.id, 12);
    mockProducts = getMockProductsByStoreSlug(mockStore.slug);
  } else {
    notFound();
  }

  const canManage = Boolean(user?.id && ownerUserId && user.id === ownerUserId);
  const canUsePrivateContactActions = Boolean(user?.id);

  const coverSrc = store.coverUrl?.trim() || '';
  const logoSrc = store.logoUrl?.trim() || '';
  const initials = getInitials(store.name);
  const cityLabel = cityLabelFor(locale, store.primaryCity);
  const categoriesLabel = store.categories.length
    ? store.categories
        .slice(0, 3)
        .map((category) => localizeCategoryName(category, locale))
        .join(' • ')
    : null;

  const primaryLocation = store.locations.find((item) => item.isPrimary) ?? store.locations[0] ?? null;
  const address = primaryLocation?.address?.trim() || null;
  const phoneHref = toTelHref(store.phone ?? primaryLocation?.phone ?? null);
  const waHref = toWhatsAppHref(store.whatsapp ?? store.phone ?? null);
  const siteHref = toWebsiteHref(store.website);
  const directionsHref = toDirectionsHref(primaryLocation, store.name);

  const offerStore = {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl,
    primaryCity: store.primaryCity,
  };
  const offersForCards = offers.map((offer) => ({ ...offer, store: offerStore }));

  const services = offersForCards;

  const productItems: SponsorStoreProductCardModel[] = products.length
    ? products.map((product) => ({
        id: product.id,
        title: product.title,
        price: product.price,
        originalPrice: typeof product.originalPrice === 'number' ? product.originalPrice : null,
        currency: product.currency ?? null,
        imageUrl: product.imageUrls?.[0] ?? null,
        href: `/product/${product.id}`,
      }))
    : mockProducts.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        originalPrice: item.originalPrice ?? null,
        currency: item.currency ?? null,
        imageUrl: item.imageUrl ?? null,
        href: `/sponsors/products/${item.id}`,
      }));

  const basketKey = `ku:sponsorBasket:${store.slug}`;
  const maxProductOff = productItems.reduce((best, item) => {
    const pct = computePercentOff(item.originalPrice ?? null, item.price);
    return pct && pct > best ? pct : best;
  }, 0);
  const maxServiceOff = services.reduce((best, offer) => {
    if (offer.discountType === 'percent' && typeof offer.discountValue === 'number') {
      const pct = Math.round(offer.discountValue);
      return pct > best ? pct : best;
    }
    return best;
  }, 0);
  const maxOff = Math.max(maxProductOff, maxServiceOff);
  const formattedMaxOff = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(maxOff / 100);

  const hasProducts = productItems.length > 0;
  const hasServices = services.length > 0;
  const defaultTab = hasProducts ? 'products' : 'services';
  const requestedTab = (query?.tab ?? '').trim().toLowerCase();
  const activeTab = requestedTab === 'services' || requestedTab === 'products' ? requestedTab : defaultTab;

  return (
    <AppLayout user={user}>
      <section className="pt-4 pb-24 bg-accent">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="mx-auto max-w-5xl space-y-5">
            <div className="overflow-hidden rounded-[22px] border border-black/10 bg-[#EFEFEF] shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
              <div className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
                      {logoSrc ? (
                        <Image src={logoSrc} alt="" fill sizes="56px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-base font-extrabold text-brand" aria-hidden="true">
                          {initials}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h1 className="line-clamp-1 text-[1.15rem] font-extrabold text-[#1F2937] md:text-[1.7rem]" dir="auto">
                        {store.name}
                      </h1>
                      {categoriesLabel ? (
                        <p className="mt-0.5 line-clamp-1 text-base font-semibold text-[#6B7280]" dir={isRtl ? 'rtl' : 'ltr'}>
                          {categoriesLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#F87171] bg-[#B91C1C] px-3 py-1 text-xs font-extrabold text-white shadow-[0_6px_14px_rgba(185,28,28,0.35)]">
                      {serverTranslate(locale, 'sponsorsHub.sponsoredBadge')}
                    </span>
                    <VerifiedBadge
                      size="sm"
                      label={serverTranslate(locale, 'profile.overview.trustedBadge')}
                      className="h-6 w-6 justify-center rounded-full ring-2 ring-white shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="relative h-[180px] w-full overflow-hidden bg-white md:h-[220px]">
                {coverSrc ? (
                  <Image src={coverSrc} alt="" fill sizes="(max-width: 768px) 100vw, 960px" className="object-cover" priority />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(247,111,29,0.2),rgba(255,255,255,0.7))]" />
                )}

                {maxOff > 0 ? (
                  <div
                    className={cn(
                      'absolute bottom-3 left-3 inline-flex items-center rounded-xl bg-[#F28C34] px-3.5 py-2 text-[1.1rem] font-extrabold text-white shadow-[0_8px_20px_rgba(0,0,0,0.24)]',
                      isRtl && 'left-auto right-3',
                    )}
                  >
                    {serverTranslate(locale, 'sponsorStore.savings.upTo').replace('{percent}', formattedMaxOff)}
                  </div>
                ) : null}
              </div>

              <div className="p-4 md:p-5">
                {(cityLabel || address) ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#6B7280] md:text-base" dir="auto">
                    <MapPin className="h-5 w-5 shrink-0 text-[#7C8493]" aria-hidden="true" />
                    <span className="line-clamp-1" dir="auto">
                      {[cityLabel, address].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar [-webkit-overflow-scrolling:touch]">
                  <div className="flex items-center gap-2">
                    <Button
                      asChild
                      size="icon"
                      variant="secondary"
                      className={cn(
                        'h-11 w-11 rounded-full bg-[#E8E8E8] text-[#1F2937] shadow-sm hover:bg-[#DEDEDE]',
                        !phoneHref || !canUsePrivateContactActions ? 'pointer-events-none opacity-55' : null,
                      )}
                    >
                      <Link
                        href={phoneHref && canUsePrivateContactActions ? phoneHref : '#'}
                        aria-label={serverTranslate(locale, 'sponsorStore.actions.call')}
                        aria-disabled={!phoneHref || !canUsePrivateContactActions}
                        title={!canUsePrivateContactActions ? serverTranslate(locale, 'header.loginRequired') : undefined}
                      >
                        <Phone className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </Button>

                    <Button asChild size="icon" variant="secondary" className="h-11 w-11 rounded-full bg-[#E8E8E8] text-[#1F2937] shadow-sm hover:bg-[#DEDEDE]">
                      <Link href={directionsHref} target="_blank" rel="noreferrer" aria-label={serverTranslate(locale, 'sponsorStore.actions.directions')}>
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </Button>

                    <Button
                      asChild
                      size="icon"
                      variant="secondary"
                      className={cn('h-11 w-11 rounded-full bg-[#E8E8E8] text-[#1F2937] shadow-sm hover:bg-[#DEDEDE]', !siteHref ? 'pointer-events-none opacity-55' : null)}
                    >
                      <Link
                        href={siteHref ?? '#'}
                        target={siteHref ? '_blank' : undefined}
                        rel={siteHref ? 'noreferrer' : undefined}
                        aria-label={serverTranslate(locale, 'sponsorStore.actions.website')}
                        aria-disabled={!siteHref}
                      >
                        <Globe className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      className={cn(
                        'h-11 shrink-0 rounded-full bg-[#57C878] px-4 text-base font-bold text-white shadow-[0_6px_18px_rgba(87,200,120,0.26),0_1px_6px_rgba(87,200,120,0.18)] hover:bg-[#4FB66D]',
                        !waHref || !canUsePrivateContactActions ? 'pointer-events-none opacity-55' : null,
                      )}
                    >
                      <Link
                        href={waHref && canUsePrivateContactActions ? waHref : '#'}
                        target={waHref && canUsePrivateContactActions ? '_blank' : undefined}
                        rel={waHref && canUsePrivateContactActions ? 'noreferrer' : undefined}
                        className={cn(isRtl && 'flex-row-reverse')}
                        aria-disabled={!waHref || !canUsePrivateContactActions}
                        title={!canUsePrivateContactActions ? serverTranslate(locale, 'header.loginRequired') : undefined}
                      >
                        <MessageCircle className="h-6 w-6" aria-hidden="true" />
                        <span className="text-base leading-none">{serverTranslate(locale, 'sponsorStore.actions.whatsapp')}</span>
                      </Link>
                    </Button>
                  </div>
                </div>

                {canManage ? (
                  <div className="mt-3">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-full border-black/10 bg-white/70 px-3.5 text-xs font-bold shadow-sm hover:bg-white"
                    >
                      <Link href="/sponsors/manage" prefetch={false} className={cn(isRtl && 'flex-row-reverse')}>
                        {serverTranslate(locale, 'sponsorManage.manageButton')}
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Content: only Services + Products (mobile-first, minimal vertical scroll). */}
            <div className="space-y-5">
              <SponsorStoreTabs
                initialTab={activeTab as 'products' | 'services'}
                productsLabel={serverTranslate(locale, 'sponsorStore.sections.products')}
                servicesLabel={serverTranslate(locale, 'sponsorStore.sections.services')}
                productsCount={productItems.length}
                servicesCount={services.length}
                dealsLabel={serverTranslate(locale, 'sponsorStore.savings.dealsLabel')}
                products={
                  productItems.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {productItems.map((item) => (
                        <SponsorStoreProductCard key={item.id} item={item} locale={locale} basketKey={basketKey} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-white/70 bg-white/75 p-4 text-center shadow-[0_10px_30px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
                      <p className="text-sm font-bold text-[#111827]" dir="auto">
                        {serverTranslate(locale, 'sponsorStore.noProducts.title')}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground" dir="auto">
                        {serverTranslate(locale, 'sponsorStore.noProducts.description')}
                      </p>
                    </div>
                  )
                }
                services={
                  services.length ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {services.map((offer) => (
                        <SponsorStoreServiceCard
                          key={offer.id}
                          offer={offer}
                          locale={locale}
                          sponsoredLabel={serverTranslate(locale, 'sponsorsHub.sponsoredBadge')}
                          endsLabel={(time) => serverTranslate(locale, 'sponsorsHub.endsIn').replace('{time}', time)}
                          href={`/sponsors/offers/${offer.id}`}
                          className="w-full"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-white/70 bg-white/75 p-4 text-center shadow-[0_10px_30px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
                      <p className="text-sm font-bold text-[#111827]" dir="auto">
                        {serverTranslate(locale, 'sponsorStore.noOffers.title')}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground" dir="auto">
                        {serverTranslate(locale, 'sponsorStore.noOffers.description')}
                      </p>
                    </div>
                  )
                }
              />
            </div>
          </div>
        </div>
      </section>

      <SponsorStoreBasketBar
        basketKey={basketKey}
        storeName={store.name}
        waHref={waHref}
        locale={locale}
        basketLabel={serverTranslate(locale, 'sponsorStore.basket.title')}
        sendLabel={serverTranslate(locale, 'sponsorStore.basket.send')}
        clearLabel={serverTranslate(locale, 'sponsorStore.basket.clear')}
      />
    </AppLayout>
  );
}
