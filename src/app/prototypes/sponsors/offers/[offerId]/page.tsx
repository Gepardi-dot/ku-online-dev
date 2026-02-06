import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgePercent, Clock, Globe, MapPin, MessageCircle, Phone, Store } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales, translations, type Locale } from '@/lib/locale/dictionary';
import { applyArabicComma, getNumberLocale } from '@/lib/locale/formatting';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';
import { getPrototypeOfferById } from '@/lib/prototypes/sponsors';

function formatDiscount(
  offer: { discountType: string; discountValue: number | null; currency: string | null },
  locale: Locale,
): string {
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
  const pattern = locale === 'ar' || locale === 'ku' ? 'yyyy-MM-dd' : 'yyyy-MM-dd';
  return format(value, pattern);
}

function isOfferActiveNow(offer: { status: string; startAt: Date | null; endAt: Date | null }, now: Date): boolean {
  if (offer.status !== 'active') return false;
  if (offer.startAt && offer.startAt.getTime() > now.getTime()) return false;
  if (offer.endAt && offer.endAt.getTime() <= now.getTime()) return false;
  return true;
}

export default async function PrototypeSponsorOfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;

  const locale = await getServerLocale();
  const messages = translations[locale];
  const isRtl = rtlLocales.includes(locale);
  const sponsoredLabel = serverTranslate(locale, 'sponsorsHub.sponsoredBadge');

  const offer = getPrototypeOfferById(offerId);
  if (!offer) {
    notFound();
  }

  const now = new Date();
  const activeNow = isOfferActiveNow(offer, now);

  const store = offer.store;
  const storeHref = store?.slug ? `/prototypes/sponsors/stores/${store.slug}` : '/prototypes/sponsors';
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
    <section className="pt-10 pb-12">
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
                  {!activeNow ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200/70" dir="auto">
                      Prototype: expired / inactive state
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-4 text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
                  {offer.title}
                </h1>
                {offer.description ? (
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground" dir="auto">
                    {offer.description}
                  </p>
                ) : null}

                {validity ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    <span dir="auto">{validity}</span>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button asChild variant="ghost" className="rounded-full">
                    <Link href={storeHref}>
                      <Store className={cn('h-4 w-4', isRtl ? 'rotate-180' : null)} aria-hidden="true" />
                      {serverTranslate(locale, 'sponsorOffer.backToStore')}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 md:w-[320px]">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-white/80 shadow-sm ring-1 ring-black/5">
                    {logoSrc ? (
                      <Image src={logoSrc} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg" aria-hidden="true">
                        🏪
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-[#2D2D2D]" dir="auto">
                      {store?.name ?? 'Store'}
                    </p>
                    {store?.primaryCity ? (
                      <p className="text-xs text-muted-foreground" dir="auto">
                        {serverTranslate(locale, `header.city.${store.primaryCity}`)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button asChild variant="secondary" className="h-11 rounded-full bg-white text-primary shadow-sm hover:bg-white/90">
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
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm ring-1 ring-black/5">
                <h2 className="text-base font-bold text-[#2D2D2D]" dir="auto">
                  {serverTranslate(locale, 'sponsorOffer.howToUse.title')}
                </h2>
                <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li dir="auto">1) {serverTranslate(locale, 'sponsorOffer.howToUse.step1')}</li>
                  <li dir="auto">2) {serverTranslate(locale, 'sponsorOffer.howToUse.step2')}</li>
                  <li dir="auto">3) {serverTranslate(locale, 'sponsorOffer.howToUse.step3')}</li>
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
        </div>
      </div>
    </section>
  );
}
