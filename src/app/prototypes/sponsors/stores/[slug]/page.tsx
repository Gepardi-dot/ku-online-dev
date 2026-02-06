import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe, MapPin, MessageCircle, Phone } from 'lucide-react';

import { SponsorStoreBasketBar } from '@/components/sponsors/SponsorStoreBasketBar';
import { Button } from '@/components/ui/button';
import { SponsorStoreProductCard } from '@/components/sponsors/SponsorStoreProductCard';
import { SponsorStoreServiceCard } from '@/components/sponsors/SponsorStoreServiceCard';
import { SponsorStoreTabs } from '@/components/sponsors/SponsorStoreTabs';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import type { Locale } from '@/lib/locale/dictionary';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { buildPreviewOffers, buildPreviewProducts } from '@/lib/prototypes/sponsor-store-preview';
import { getPrototypeStoreBySlug, listPrototypeOffersByStoreId } from '@/lib/prototypes/sponsors';
import type { SponsorStoreCategory, SponsorStoreLocation } from '@/lib/services/sponsors';
import { cn } from '@/lib/utils';

function localizeCategoryName(value: SponsorStoreCategory, locale: Locale): string {
  if (locale === 'ar') return value.nameAr ?? value.name;
  if (locale === 'ku') return value.nameKu ?? value.name;
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

export default async function PrototypeSponsorStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const isRtl = locale === 'ar' || locale === 'ku';

  const store = getPrototypeStoreBySlug(slug);
  if (!store) {
    notFound();
  }

  const now = new Date();
  const offers = listPrototypeOffersByStoreId(store.id).filter((offer) => {
    if (offer.status !== 'active') return false;
    if (offer.startAt && offer.startAt.getTime() > now.getTime()) return false;
    if (offer.endAt && offer.endAt.getTime() <= now.getTime()) return false;
    return true;
  });

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

  const sponsoredLabel = serverTranslate(locale, 'sponsorsHub.sponsoredBadge');
  const endsLabel = (time: string) => serverTranslate(locale, 'sponsorsHub.endsIn').replace('{time}', time);
  const previewProducts = buildPreviewProducts({
    seed: `${store.slug}:${store.updatedAt?.toISOString?.() ?? ''}`,
    storeName: store.name,
    coverUrl: store.coverUrl,
    primaryCity: store.primaryCity,
    count: 6,
  });
  const previewOffers = offers.length
    ? []
    : buildPreviewOffers({
        seed: `${store.slug}:${store.updatedAt?.toISOString?.() ?? ''}`,
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          logoUrl: store.logoUrl,
          primaryCity: store.primaryCity,
        },
        count: 4,
      });
  const services = offers.length ? offers : previewOffers;
  const basketKey = `ku:sponsorBasket:${store.slug}`;
  const maxProductOff = previewProducts.reduce((best, item) => {
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

  const hasProducts = previewProducts.length > 0;
  const hasServices = services.length > 0;
  const defaultTab = hasProducts ? 'products' : 'services';
  const requestedTab = (query?.tab ?? '').trim().toLowerCase();
  const activeTab = requestedTab === 'services' || requestedTab === 'products' ? requestedTab : defaultTab;

  return (
    <section className="pt-4 pb-24 bg-accent">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" className="rounded-full bg-white/80">
              <Link href="/prototypes/sponsors">Back</Link>
            </Button>
          </div>

          <div className="relative overflow-hidden rounded-[22px] border border-white/60 bg-white/70 shadow-[0_10px_34px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
            <div className="absolute inset-0">
              {coverSrc ? (
                <>
                  <Image src={coverSrc} alt="" fill sizes="100vw" className="object-cover opacity-35" priority />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/85 via-white/70 to-white/35" />
                </>
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.18),rgba(255,255,255,0.0)_58%)]" />
              )}

              <div className="pointer-events-none absolute inset-0 opacity-70 motion-safe:animate-aurora motion-reduce:opacity-40">
                <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand/16 blur-3xl" />
                <div className="absolute -right-28 -bottom-28 h-72 w-72 rounded-full bg-brand-light/14 blur-3xl" />
              </div>
            </div>

            <div className="relative p-3.5 md:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/85 shadow-sm ring-1 ring-black/5">
                    {logoSrc ? (
                      <Image src={logoSrc} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-base font-extrabold text-brand" aria-hidden="true">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="line-clamp-1 text-[1.05rem] font-extrabold text-[#2D2D2D] md:text-xl" dir="auto">
                        {store.name}
                      </h1>
                      <span className="rounded-full bg-brand/12 px-2.5 py-1 text-[0.68rem] font-extrabold text-brand ring-1 ring-brand/15">
                        {serverTranslate(locale, 'sponsorsHub.sponsoredBadge')}
                      </span>
                      <VerifiedBadge
                        size="sm"
                        label={serverTranslate(locale, 'profile.overview.trustedBadge')}
                        className="h-6 w-6 justify-center rounded-full ring-2 ring-white/60 shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
                      />
                    </div>

                    {(cityLabel || address) ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground" dir="auto">
                        {cityLabel ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 ring-1 ring-black/5">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            <span dir="auto">{cityLabel}</span>
                          </span>
                        ) : null}
                        {address ? (
                          <span className="line-clamp-1 inline-flex max-w-full items-center gap-1 rounded-full bg-white/70 px-3 py-1 ring-1 ring-black/5">
                            <span dir="auto">{address}</span>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5 no-scrollbar [-webkit-overflow-scrolling:touch]">
                <Button
                  asChild
                  size="sm"
                  className={cn(
                    'h-9 shrink-0 rounded-full bg-[#25D366] px-3.5 text-white shadow-sm hover:bg-[#1FB857]',
                    !waHref ? 'pointer-events-none opacity-55' : null,
                  )}
                >
                  <Link
                    href={waHref ?? '#'}
                    target={waHref ? '_blank' : undefined}
                    rel={waHref ? 'noreferrer' : undefined}
                    className={cn(isRtl && 'flex-row-reverse')}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    {serverTranslate(locale, 'sponsorStore.actions.whatsapp')}
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className={cn('h-9 shrink-0 rounded-full bg-[#111827] px-3.5 text-white hover:bg-[#111827]/90', !phoneHref ? 'pointer-events-none opacity-55' : null)}
                >
                  <Link href={phoneHref ?? '#'} className={cn(isRtl && 'flex-row-reverse')}>
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {serverTranslate(locale, 'sponsorStore.actions.call')}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary" className="h-9 shrink-0 rounded-full bg-white/80 px-3.5 text-primary shadow-sm hover:bg-white">
                  <Link href={directionsHref} target="_blank" rel="noreferrer" className={cn(isRtl && 'flex-row-reverse')}>
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    {serverTranslate(locale, 'sponsorStore.actions.directions')}
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  className={cn('h-9 shrink-0 rounded-full bg-white/80 px-3.5 text-primary shadow-sm hover:bg-white', !siteHref ? 'pointer-events-none opacity-55' : null)}
                >
                  <Link
                    href={siteHref ?? '#'}
                    target={siteHref ? '_blank' : undefined}
                    rel={siteHref ? 'noreferrer' : undefined}
                    className={cn(isRtl && 'flex-row-reverse')}
                  >
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    {serverTranslate(locale, 'sponsorStore.actions.website')}
                  </Link>
                </Button>
              </div>

              {categoriesLabel ? (
                <p className="mt-1.5 line-clamp-1 text-xs font-semibold text-muted-foreground" dir="auto">
                  {categoriesLabel}
                </p>
              ) : null}

              {maxOff > 0 ? (
                <div
                  className={cn(
                    'mt-2 inline-flex items-center gap-2 rounded-full bg-red-600/90 px-3.5 py-1.5 text-sm font-extrabold text-white shadow-sm ring-1 ring-white/15',
                    isRtl && 'flex-row-reverse',
                  )}
                >
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden="true" />
                  {serverTranslate(locale, 'sponsorStore.savings.upTo').replace('{percent}', formattedMaxOff)}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-5">
            <SponsorStoreTabs
              initialTab={activeTab as 'products' | 'services'}
              productsLabel={serverTranslate(locale, 'sponsorStore.sections.products')}
              servicesLabel={serverTranslate(locale, 'sponsorStore.sections.services')}
              productsCount={previewProducts.length}
              servicesCount={services.length}
              dealsLabel={serverTranslate(locale, 'sponsorStore.savings.dealsLabel')}
              products={
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {previewProducts.map((item) => (
                    <SponsorStoreProductCard
                      key={item.id}
                      item={{
                        id: item.id,
                        title: item.title,
                        price: item.price,
                        originalPrice: item.originalPrice,
                        currency: item.currency,
                        imageUrl: item.imageUrl,
                        href: null,
                      }}
                      locale={locale}
                      basketKey={basketKey}
                    />
                  ))}
                </div>
              }
              services={
                services.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {services.map((offer) => (
                      <SponsorStoreServiceCard
                        key={offer.id}
                        offer={offer}
                        locale={locale}
                        sponsoredLabel={sponsoredLabel}
                        endsLabel={endsLabel}
                        href={offer.id.startsWith('preview-offer-') ? null : `/prototypes/sponsors/offers/${offer.id}`}
                        className="w-full"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[26px] border border-white/60 bg-white/70 p-6 text-center shadow-[0_10px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
                    <p className="text-base font-bold text-[#2D2D2D]" dir="auto">
                      {serverTranslate(locale, 'sponsorStore.noOffers.title')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                      {serverTranslate(locale, 'sponsorStore.noOffers.description')}
                    </p>
                  </div>
                )
              }
            />
          </div>
        </div>
      </div>

      <SponsorStoreBasketBar
        basketKey={basketKey}
        storeName={store.name}
        waHref={waHref}
        locale={locale}
        basketLabel={serverTranslate(locale, 'sponsorStore.basket.title')}
        sendLabel={serverTranslate(locale, 'sponsorStore.basket.send')}
        clearLabel={serverTranslate(locale, 'sponsorStore.basket.clear')}
      />
    </section>
  );
}
