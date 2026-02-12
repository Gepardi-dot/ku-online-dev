import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { PartnershipInquiry } from '@/components/marketing/partnership-inquiry';
import { SponsorSpotlightStoreCard } from '@/components/sponsors/SponsorSpotlightStoreCard';
import { MARKET_CITY_OPTIONS, type MarketCityValue } from '@/data/market-cities';
import { isAdmin, isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { type LocaleMessages, translations } from '@/lib/locale/dictionary';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';
import { cn } from '@/lib/utils';
import { getSponsorLiveStatsVisibility } from '@/lib/services/app-settings';
import { listSponsorOfferPreviewsByStoreIds, listSponsorStoreLiveStatsByIds, listSpotlightSponsorStores } from '@/lib/services/sponsors';
import { createClient } from '@/utils/supabase/server';

type SponsorsPageSearchParams = {
  city?: string;
};

const CITY_OPTIONS = MARKET_CITY_OPTIONS;
const DEFAULT_CITY: MarketCityValue = 'all';

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
  const canReviewApplications = isModerator(user);
  const liveStatsVisibility = await getSponsorLiveStatsVisibility();
  const showLiveStats = isModerator(user) || liveStatsVisibility.publicVisible;

  const locale = await getServerLocale();
  const messages: LocaleMessages = translations[locale];

  const city = normalizeCitySelection(params.city);
  const cityFilter = city;

  let sellerApplicationsCount: number | null = null;
  if (canReviewApplications) {
    const env = getEnv();
    const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { count, error } = await supabaseAdmin
      .from('partnership_inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('partnership_type', SELLER_APPLICATION_TYPE);
    if (error) {
      console.error('Failed to load seller applications count', error);
    } else {
      sellerApplicationsCount = count ?? 0;
    }
  }

  const spotlightStores = await listSpotlightSponsorStores({ city: cityFilter, limit: 8 });
  const offerByStoreId = await listSponsorOfferPreviewsByStoreIds(spotlightStores.map((s) => s.id));
  const initialStatsByStoreId = showLiveStats
    ? await listSponsorStoreLiveStatsByIds(spotlightStores.map((store) => store.id))
    : {};
  const selectedCityLabel =
    city === 'all'
      ? serverTranslate(locale, 'sponsorsHub.cityAllLabel')
      : serverTranslate(locale, `header.city.${city}`);
  const sponsoredLabel = serverTranslate(locale, 'sponsorsHub.sponsoredBadge');
  const applicationsHref = `/admin/partnerships?type=${encodeURIComponent(SELLER_APPLICATION_TYPE)}&status=new`;

  return (
    <AppLayout user={user}>
      <section className="pt-8 pb-5 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-6xl">
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
                  <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 snap-x snap-proximity scroll-px-2 [-webkit-overflow-scrolling:touch] overscroll-x-contain touch-pan-x">
                    {CITY_OPTIONS.filter((option) => option.value !== 'all').map((option) => {
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
                              ? 'bg-brand text-white shadow-[0_14px_40px_rgba(247,111,29,0.24)]'
                              : 'bg-white/85 text-muted-foreground hover:bg-white',
                          )}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-6xl space-y-5">
            <div className="relative overflow-hidden rounded-[24px] border border-white/70 bg-linear-to-br from-white/90 via-white/82 to-white/70 p-4 shadow-[0_16px_45px_rgba(15,23,42,0.10)] ring-1 ring-white/55 md:p-5">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -left-16 -top-12 h-44 w-44 rounded-full bg-brand/14 blur-3xl" />
                <div className="absolute -right-20 -bottom-14 h-48 w-48 rounded-full bg-brand-light/14 blur-3xl" />
              </div>
              <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold text-[#2D2D2D] md:text-2xl" dir="auto">
                    {serverTranslate(locale, 'sponsorsHub.spotlightTitle')}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563] ring-1 ring-black/5" dir="auto">
                      {serverTranslate(locale, 'header.filterLabel')}: {selectedCityLabel}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563] ring-1 ring-black/5" dir="auto">
                      {spotlightStores.length}/8
                    </span>
                    {canReviewApplications && sellerApplicationsCount !== null ? (
                      <Link
                        href={applicationsHref}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563] ring-1 ring-black/5 transition hover:bg-[#F9FAFB]"
                        dir="auto"
                      >
                        {serverTranslate(locale, 'sponsorsHub.applicationsCount').replace(
                          '{count}',
                          String(sellerApplicationsCount),
                        )}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {canReviewApplications ? (
                    <Link
                      href="/admin/partnerships"
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#111827] shadow-sm transition hover:bg-[#F9FAFB]"
                      dir="auto"
                    >
                      {serverTranslate(locale, 'sponsorsHub.applicationsButton')}
                    </Link>
                  ) : null}
                  {canCreateStore ? (
                    <Link
                      href="/admin/sponsors/new"
                      className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(247,111,29,0.25)] transition hover:bg-brand/90"
                      dir="auto"
                    >
                      Create store
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Mobile: 1 column. Desktop: 2 columns. */}
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 -top-4 h-16 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.16),rgba(247,111,29,0))] blur-2xl" />
              <div className="relative grid grid-cols-1 gap-5 md:grid-cols-2">
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
                  sponsoredLabel={sponsoredLabel}
                  showLiveStats={showLiveStats}
                />
              ))}

              {!spotlightStores.length ? (
                <div className="rounded-[28px] border border-white/65 bg-linear-to-br from-white/80 via-white/72 to-white/58 p-8 text-center shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40 md:col-span-2">
                  <h3 className="text-lg font-bold text-[#2D2D2D]" dir="auto">
                    {serverTranslate(locale, 'sponsorsHub.empty.title')}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                    {serverTranslate(locale, 'sponsorsHub.empty.description')}
                  </p>
                  {canReviewApplications && (sellerApplicationsCount ?? 0) > 0 ? (
                    <p className="mt-3 text-xs font-medium text-[#6B7280]" dir="auto">
                      {serverTranslate(locale, 'sponsorsHub.applicationsHint').replace(
                        '{count}',
                        String(sellerApplicationsCount ?? 0),
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            </div>

            <div className="rounded-[22px] border border-white/65 bg-white/72 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/45 md:p-5">
              <PartnershipInquiry
                mode="seller"
                isSignedIn={Boolean(user)}
                className="items-start"
                buttonClassName="h-11 rounded-full bg-brand px-7 text-white shadow-[0_12px_30px_rgba(247,111,29,0.28)] hover:bg-brand/90"
              />
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
