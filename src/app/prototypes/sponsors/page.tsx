'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import SwipeHint from '@/components/ui/swipe-hint';
import { Button } from '@/components/ui/button';
import { MARKET_CITY_OPTIONS, type MarketCityValue } from '@/data/market-cities';
import { cn } from '@/lib/utils';
import { rtlLocales } from '@/lib/locale/dictionary';
import { useLocale } from '@/providers/locale-provider';
import { SponsorSpotlightStoreCard } from '@/components/sponsors/SponsorSpotlightStoreCard';
import { PROTOTYPE_OFFERS, PROTOTYPE_STORES, type PrototypeSponsorStore } from '@/lib/prototypes/sponsors';

export default function PrototypeSponsorsHubPage() {
  const { t, locale } = useLocale();
  const isRtl = rtlLocales.includes(locale);
  const swipeDirection = isRtl ? 'rtl' : 'ltr';

  const cityOptions = useMemo(
    () => MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all'),
    [],
  );
  const defaultCity = cityOptions[0]?.value ?? 'erbil';
  const [city, setCity] = useState<MarketCityValue>(defaultCity);

  return (
    <>
      <section className="pt-8 pb-6">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-[40px] border border-white/60 bg-linear-to-br from-white/78 via-white/68 to-white/45 p-5 shadow-[0_22px_62px_rgba(15,23,42,0.14)] ring-1 ring-white/40 md:p-8">
              <div className="pointer-events-none absolute inset-0 opacity-85 motion-safe:animate-aurora motion-reduce:opacity-50">
                <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand/18 blur-3xl" />
                <div className="absolute -right-24 -bottom-28 h-80 w-80 rounded-full bg-brand-light/18 blur-3xl" />
                <div className="absolute left-1/3 top-10 h-56 w-56 rounded-full bg-brand/10 blur-3xl motion-safe:animate-float" />
              </div>
              <div className="pointer-events-none absolute inset-0 opacity-60 motion-safe:animate-glow">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.16),rgba(255,255,255,0.0)_58%)]" />
              </div>
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-1/2 top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent motion-safe:animate-shimmer motion-reduce:hidden" />
              </div>

              <div className="relative space-y-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative h-10 w-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                      <Image src="/Sponsor.png.png" alt="" fill className="object-contain scale-[1.75] p-1.5" priority />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg font-extrabold text-[#2D2D2D] md:text-xl" dir="auto">
                        Stores and Sponsors
                      </h1>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" className="rounded-full bg-white/80">
                      <Link href="/prototypes">Back to showroom</Link>
                    </Button>
                  </div>
                </div>

                <div className="pt-1">
                  <SwipeHint
                    label={t('homepage.swipeHint')}
                    direction={swipeDirection}
                    containerClassName="no-scrollbar flex gap-2 overflow-x-auto pb-1 snap-x snap-proximity scroll-px-2 [-webkit-overflow-scrolling:touch] overscroll-x-contain touch-pan-x"
                  >
                    {cityOptions.map((option) => {
                      const selected = city === option.value;
                      const label = t(`header.city.${option.value}`);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setCity(option.value)}
                          className={cn(
                            'shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-black/5 transition active:scale-[0.98]',
                            selected
                              ? 'bg-brand text-white shadow-[0_14px_40px_rgba(247,111,29,0.18)]'
                              : 'bg-white/80 text-muted-foreground hover:bg-white',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </SwipeHint>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-12">
        <div className="container mx-auto px-4 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[#2D2D2D] md:text-2xl" dir="auto">
              {t('sponsorsHub.spotlightTitle')}
            </h2>
            <span className="text-sm font-semibold text-muted-foreground" dir="auto">
              8/8
            </span>
          </div>

          <SponsoredStoresSpotlightGrid
            city={city}
            sponsoredLabel={t('sponsorsHub.sponsoredBadge')}
            cityT={(c) => t(`header.city.${c}`)}
            locale={locale}
          />
        </div>
      </section>
    </>
  );
}

function SponsoredStoresSpotlightGrid({
  city,
  sponsoredLabel,
  cityT,
  locale,
}: {
  city: MarketCityValue;
  sponsoredLabel: string;
  cityT: (city: string) => string;
  locale: 'en' | 'ar' | 'ku';
}) {
  const stores = useMemo(() => {
    const active = PROTOTYPE_STORES.filter((s) => s.status === 'active');
    const filtered = city === 'all' ? active : active.filter((s) => s.primaryCity === city);
    const ranked = filtered.slice().sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    return ranked.slice(0, 8);
  }, [city]);

  const offerByStoreId = useMemo(() => {
    const now = Date.now();
    const out: Record<string, (typeof PROTOTYPE_OFFERS)[number] | undefined> = {};
    for (const offer of PROTOTYPE_OFFERS) {
      if (offer.status !== 'active') continue;
      const startOk = !offer.startAt || offer.startAt.getTime() <= now;
      const endOk = !offer.endAt || offer.endAt.getTime() > now;
      if (!startOk || !endOk) continue;

      const current = out[offer.storeId];
      if (!current) {
        out[offer.storeId] = offer;
        continue;
      }

      const better =
        Number(offer.isFeatured) > Number(current.isFeatured) ||
        (Number(offer.isFeatured) === Number(current.isFeatured) &&
          (offer.endAt?.getTime() ?? Number.POSITIVE_INFINITY) < (current.endAt?.getTime() ?? Number.POSITIVE_INFINITY));
      if (better) out[offer.storeId] = offer;
    }
    return out;
  }, []);

  if (stores.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-7 text-center shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
        <h3 className="text-lg font-bold text-[#2D2D2D]" dir="auto">
          No sponsored stores yet
        </h3>
        <p className="mt-2 text-sm text-muted-foreground" dir="auto">
          This is the empty state while onboarding partners.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild className="rounded-full">
            <Link href="/prototypes/admin/sponsors">Preview admin onboarding</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {stores.map((store) => (
        <SponsorSpotlightStoreCard
          key={store.id}
          store={store}
          offer={
            offerByStoreId[store.id]
              ? {
                  id: offerByStoreId[store.id]!.id,
                  storeId: offerByStoreId[store.id]!.storeId,
                  title: offerByStoreId[store.id]!.title,
                  discountType: offerByStoreId[store.id]!.discountType,
                  discountValue: offerByStoreId[store.id]!.discountValue ?? null,
                  currency: offerByStoreId[store.id]!.currency ?? null,
                  endAt: offerByStoreId[store.id]!.endAt ?? null,
                  originalPrice: offerByStoreId[store.id]!.originalPrice ?? null,
                  dealPrice: offerByStoreId[store.id]!.dealPrice ?? null,
                }
              : null
          }
          sponsoredLabel={sponsoredLabel}
          cityLabel={store.primaryCity ? cityT(store.primaryCity) : null}
          href={`/prototypes/sponsors/stores/${store.slug}`}
          locale={locale}
        />
      ))}
    </div>
  );
}
