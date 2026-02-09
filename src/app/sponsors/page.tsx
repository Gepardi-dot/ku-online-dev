import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';

import AppLayout from '@/components/layout/app-layout';
import { PartnershipInquiry } from '@/components/marketing/partnership-inquiry';
import { SponsorSpotlightStoreCard } from '@/components/sponsors/SponsorSpotlightStoreCard';
import SwipeHint from '@/components/ui/swipe-hint';
import { MARKET_CITY_OPTIONS, type MarketCityValue } from '@/data/market-cities';
import { isAdmin, isModerator } from '@/lib/auth/roles';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales, type LocaleMessages, translations } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';
import { getSponsorLiveStatsVisibility } from '@/lib/services/app-settings';
import { listSponsorOfferPreviewsByStoreIds, listSponsorStoreLiveStatsByIds, listSpotlightSponsorStores } from '@/lib/services/sponsors';
import { createClient } from '@/utils/supabase/server';

type SponsorsPageSearchParams = {
  city?: string;
};

const CITY_OPTIONS = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');
const DEFAULT_CITY = CITY_OPTIONS[0]?.value ?? 'erbil';

function normalizeCitySelection(value: string | null | undefined): MarketCityValue {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!candidate || candidate === 'all') return DEFAULT_CITY;
  const match = CITY_OPTIONS.find((option) => option.value === candidate);
  return match?.value ?? DEFAULT_CITY;
}

function buildSponsorsHref(values: { city: MarketCityValue }): string {
  const params = new URLSearchParams();
  if (values.city && values.city !== DEFAULT_CITY) {
    params.set('city', values.city);
  }
  const qs = params.toString();
  return qs ? `/sponsors?${qs}` : '/sponsors';
}

export default async function SponsorsPage({ searchParams }: { searchParams?: Promise<SponsorsPageSearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canCreateStore = isAdmin(user);
  const liveStatsVisibility = await getSponsorLiveStatsVisibility();
  const showLiveStats = isModerator(user) || liveStatsVisibility.publicVisible;

  const locale = await getServerLocale();
  const messages: LocaleMessages = translations[locale];
  const isRtl = rtlLocales.includes(locale);
  const swipeDirection = isRtl ? 'rtl' : 'ltr';

  const city = normalizeCitySelection(params.city);
  const cityFilter = city;

  const spotlightStores = await listSpotlightSponsorStores({ city: cityFilter, limit: 8 });
  const offerByStoreId = await listSponsorOfferPreviewsByStoreIds(spotlightStores.map((s) => s.id));
  const initialStatsByStoreId = showLiveStats
    ? await listSponsorStoreLiveStatsByIds(spotlightStores.map((store) => store.id))
    : {};

  return (
    <AppLayout user={user}>
      <section className="pt-8 pb-5 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-[26px] border border-white/60 bg-linear-to-br from-white/78 via-white/68 to-white/45 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-5">
              <div className="pointer-events-none absolute inset-0 opacity-70 motion-safe:animate-aurora motion-reduce:opacity-40">
                <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-brand/16 blur-3xl" />
                <div className="absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-brand-light/14 blur-3xl" />
              </div>

              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    <Image src="/Sponsor.png.png" alt="" fill className="object-contain scale-[1.75] p-1" priority />
                  </div>
                  <h1 className="text-lg font-extrabold text-[#2D2D2D] md:text-xl" dir="auto">
                    {messages.homepage.sponsors}
                  </h1>
                </div>

                <div className="mt-4">
                    <SwipeHint
                      label={messages.homepage.swipeHint}
                      direction={swipeDirection}
                      containerClassName="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 snap-x snap-proximity scroll-px-2 [-webkit-overflow-scrolling:touch] overscroll-x-contain touch-pan-x"
                    >
                    {CITY_OPTIONS.map((option) => {
                      const selected = city === option.value;
                      const href = buildSponsorsHref({ city: option.value });
                      const label = serverTranslate(locale, `header.city.${option.value}`);
                      return (
                        <Link
                          key={option.value}
                          href={href}
                          className={cn(
                            'shrink-0 snap-start rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-black/5 transition active:scale-[0.98]',
                            selected
                              ? 'bg-brand text-white shadow-[0_14px_40px_rgba(247,111,29,0.18)]'
                              : 'bg-white/80 text-muted-foreground hover:bg-white',
                          )}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </SwipeHint>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold text-[#2D2D2D] md:text-2xl" dir="auto">
                {serverTranslate(locale, 'sponsorsHub.spotlightTitle')}
              </h2>
              <div className="flex items-center gap-2">
                {canCreateStore ? (
                  <Link
                    href="/admin/sponsors/new"
                    className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_10px_26px_rgba(247,111,29,0.24)] transition hover:bg-brand/90"
                    dir="auto"
                  >
                    Create store
                  </Link>
                ) : null}
                <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5" dir="auto">
                  {spotlightStores.length}/8
                </span>
              </div>
            </div>

            {/* Mobile: 1 column. Desktop: 2 columns. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {spotlightStores.map((store) => (
                <SponsorSpotlightStoreCard
                  key={store.slug}
                  store={store}
                  offer={offerByStoreId[store.id] ?? null}
                  cityLabel={store.primaryCity ? serverTranslate(locale, `header.city.${store.primaryCity}`) : null}
                  href={`/sponsors/stores/${store.slug}`}
                  locale={locale}
                  initialStats={initialStatsByStoreId[store.id] ?? null}
                  viewsLabel={serverTranslate(locale, 'sponsorsHub.liveStats.views')}
                  likesLabel={serverTranslate(locale, 'sponsorsHub.liveStats.likes')}
                  showLiveStats={showLiveStats}
                />
              ))}

              {!spotlightStores.length ? (
                <div className="rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-7 text-center shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
                  <h3 className="text-lg font-bold text-[#2D2D2D]" dir="auto">
                    {serverTranslate(locale, 'sponsorsHub.empty.title')}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                    {serverTranslate(locale, 'sponsorsHub.empty.description')}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="pt-4">
              <PartnershipInquiry
                mode="seller"
                isSignedIn={Boolean(user)}
                buttonClassName="bg-brand text-white hover:bg-brand/90"
              />
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
