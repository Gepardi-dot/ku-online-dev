import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgePercent, Clock, Globe, MapPin, MessageCircle, Phone, Store } from 'lucide-react';
import { format } from 'date-fns';

import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/server';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales, translations, type Locale } from '@/lib/locale/dictionary';
import { applyArabicComma, getNumberLocale } from '@/lib/locale/formatting';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';
import { getSponsorOfferById, type SponsorOfferDetails } from '@/lib/services/sponsors';

function formatDiscount(offer: SponsorOfferDetails, locale: Locale): string {
  if (offer.discountType === 'percent' && typeof offer.discountValue === 'number') {
    const value = Math.round(offer.discountValue);
    return `${value}% OFF`;
  }

  if (offer.discountType === 'amount' && typeof offer.discountValue === 'number') {
    const currency = offer.currency ?? 'IQD';
    const formatted = applyArabicComma(
      new Intl.NumberFormat(getNumberLocale(locale), { maximumFractionDigits: 0 }).format(
        Math.round(offer.discountValue),
      ),
      locale,
    );
    return `${formatted} ${currency} OFF`;
  }

  if (offer.discountType === 'freebie') {
    return 'FREEBIE';
  }

  return 'DEAL';
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

function formatDate(value: Date, locale: Locale): string {
  // Keep it numeric and clear; avoid heavy localization complexity for MVP.
  // Example: 2026-01-31
  const pattern = locale === 'ar' || locale === 'ku' ? 'yyyy-MM-dd' : 'yyyy-MM-dd';
  return format(value, pattern);
}

export default async function SponsorOfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getServerLocale();
  const messages = translations[locale];
  const isRtl = rtlLocales.includes(locale);
  const sponsoredLabel = serverTranslate(locale, 'sponsorsHub.sponsoredBadge');

  const offer = await getSponsorOfferById(offerId);
  if (!offer) {
    notFound();
  }

  const store = offer.store;
  const storeHref = store?.slug ? `/sponsors/stores/${store.slug}` : '/sponsors';
  const logoSrc = store?.logoUrl?.trim() || '';
  const discount = formatDiscount(offer, locale);

  const phoneHref = toTelHref(store?.phone ?? null);
  const waHref = toWhatsAppHref(store?.whatsapp ?? store?.phone ?? null);
  const siteHref = toWebsiteHref(store?.website ?? null);
  const directionsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store?.name ?? 'Store')}`;

  const validityBits: string[] = [];
  if (offer.startAt) {
    validityBits.push(`${serverTranslate(locale, 'sponsorOffer.validFrom')} ${formatDate(offer.startAt, locale)}`);
  }
  if (offer.endAt) {
    validityBits.push(`${serverTranslate(locale, 'sponsorOffer.validUntil')} ${formatDate(offer.endAt, locale)}`);
  }
  const validity = validityBits.join(' • ');

  return (
    <AppLayout user={user}>
      <section className="pt-10 pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-2xl bg-brand/10 px-3 py-2 text-sm font-extrabold tracking-wide text-brand ring-1 ring-brand/15">
                      {discount}
                    </div>
                    <SponsoredBadge label={sponsoredLabel} />
                  </div>

                  <h1 className="mt-4 text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
                    {offer.title}
                  </h1>

                  {store ? (
                    <Link
                      href={storeHref}
                      className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-[#2D2D2D]"
                    >
                      <span className="relative h-9 w-9 overflow-hidden rounded-2xl bg-white/80 shadow-sm ring-1 ring-black/5">
                        {logoSrc ? (
                          <Image src={logoSrc} alt="" fill sizes="36px" className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
                            <Store className="h-4 w-4 text-brand" />
                          </span>
                        )}
                      </span>
                      <span dir="auto">{store.name}</span>
                      <span className="text-muted-foreground/70" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  ) : null}

                  {offer.description ? (
                    <p className="mt-4 text-sm text-muted-foreground" dir="auto">
                      {offer.description}
                    </p>
                  ) : null}

                  {validity ? (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span dir="auto">{validity}</span>
                    </p>
                  ) : null}
                </div>

                <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-1 md:min-w-[220px]', isRtl ? 'md:text-right' : 'md:text-left')}>
                  <Button
                    asChild
                    variant="secondary"
                    className="h-11 rounded-full bg-white text-primary shadow-sm hover:bg-white/90"
                  >
                    <Link href={directionsHref} target="_blank" rel="noreferrer">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      {serverTranslate(locale, 'sponsorStore.actions.directions')}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    className={cn(
                      'h-11 rounded-full bg-[#25D366] text-white shadow-sm hover:bg-[#1FB857]',
                      !waHref ? 'pointer-events-none opacity-55' : null,
                    )}
                  >
                    <Link href={waHref ?? '#'} target={waHref ? '_blank' : undefined} rel={waHref ? 'noreferrer' : undefined}>
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      {serverTranslate(locale, 'sponsorStore.actions.whatsapp')}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    className={cn(
                      'h-11 rounded-full bg-white text-primary shadow-sm hover:bg-white/90',
                      !phoneHref ? 'pointer-events-none opacity-55' : null,
                    )}
                  >
                    <Link href={phoneHref ?? '#'}>
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {serverTranslate(locale, 'sponsorStore.actions.call')}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    className={cn(
                      'h-11 rounded-full bg-white text-primary shadow-sm hover:bg-white/90',
                      !siteHref ? 'pointer-events-none opacity-55' : null,
                    )}
                  >
                    <Link href={siteHref ?? '#'} target={siteHref ? '_blank' : undefined} rel={siteHref ? 'noreferrer' : undefined}>
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      {serverTranslate(locale, 'sponsorStore.actions.website')}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm ring-1 ring-black/5">
                  <h2 className="text-base font-bold text-[#2D2D2D]" dir="auto">
                    {serverTranslate(locale, 'sponsorOffer.howToUse.title')}
                  </h2>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li dir="auto">
                      1) {serverTranslate(locale, 'sponsorOffer.howToUse.step1')}
                    </li>
                    <li dir="auto">
                      2) {serverTranslate(locale, 'sponsorOffer.howToUse.step2')}
                    </li>
                    <li dir="auto">
                      3) {serverTranslate(locale, 'sponsorOffer.howToUse.step3')}
                    </li>
                  </ol>
                </div>

                <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm ring-1 ring-black/5">
                  <h2 className="text-base font-bold text-[#2D2D2D]" dir="auto">
                    {serverTranslate(locale, 'sponsorOffer.termsTitle')}
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground" dir="auto">
                    {offer.terms?.trim() ? offer.terms : serverTranslate(locale, 'sponsorOffer.noTerms')}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-sm ring-1 ring-white/40">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <BadgePercent className="h-5 w-5 text-brand" aria-hidden="true" />
                  <span dir="auto">{serverTranslate(locale, 'sponsorOffer.vouchersMvpNote')}</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Button asChild variant="link" className="text-primary font-semibold">
                <Link href={storeHref}>{serverTranslate(locale, 'sponsorOffer.backToStore')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
