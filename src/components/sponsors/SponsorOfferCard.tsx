import Image from 'next/image';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ar, ckb, enUS } from 'date-fns/locale';

import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorOffer } from '@/lib/services/sponsors';
import { cn } from '@/lib/utils';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';
import { applyArabicComma, getNumberLocale } from '@/lib/locale/formatting';

type SponsorOfferCardProps = {
  offer: SponsorOffer;
  locale: Locale;
  sponsoredLabel: string;
  endsLabel: (time: string) => string;
  href?: string | null;
  className?: string;
};

function formatDiscount(offer: SponsorOffer, locale: Locale): string {
  if (offer.discountType === 'percent' && typeof offer.discountValue === 'number') {
    const value = Math.round(offer.discountValue);
    return `${value}% OFF`;
  }

  if (offer.discountType === 'amount' && typeof offer.discountValue === 'number') {
    const currency = offer.currency ?? 'IQD';
    const value = applyArabicComma(
      new Intl.NumberFormat(getNumberLocale(locale), { maximumFractionDigits: 0 }).format(
        Math.round(offer.discountValue),
      ),
      locale,
    );
    return `${value} ${currency} OFF`;
  }

  if (offer.discountType === 'freebie') {
    return 'FREEBIE';
  }

  return 'DEAL';
}

function getDateFnsLocale(locale: Locale) {
  if (locale === 'ar') return ar;
  if (locale === 'ku') return ckb;
  return enUS;
}

export function SponsorOfferCard({
  offer,
  locale,
  sponsoredLabel,
  endsLabel,
  href,
  className,
}: SponsorOfferCardProps) {
  const storeName = offer.store?.name ?? 'Store';
  const storeLogo = offer.store?.logoUrl?.trim() || '';
  const discount = formatDiscount(offer, locale);
  const dateFnsLocale = getDateFnsLocale(locale);
  const endsIn = offer.endAt ? formatDistanceToNow(offer.endAt, { addSuffix: true, locale: dateFnsLocale }) : null;

  const card = (
    <div
      className={cn(
        'group relative w-[264px] shrink-0 overflow-hidden rounded-[28px] border border-white/60 bg-linear-to-br from-white/70 via-white/60 to-white/40 shadow-[0_10px_40px_rgba(15,23,42,0.12)] ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.16)]',
        href ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.18),rgba(255,255,255,0.0)_55%)]" />

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-white/80 shadow-sm ring-1 ring-black/5">
              {storeLogo ? (
                <Image src={storeLogo} alt="" fill sizes="44px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base" aria-hidden="true">
                  🏷️
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold text-[#2D2D2D]" dir="auto">
                {storeName}
              </p>
              {endsIn ? (
                <p className="line-clamp-1 text-xs font-medium text-muted-foreground" dir="auto">
                  {endsLabel(endsIn)}
                </p>
              ) : null}
            </div>
          </div>

          <SponsoredBadge label={sponsoredLabel} />
        </div>

        <div className="mt-4 inline-flex items-center rounded-2xl bg-brand/10 px-3 py-2 text-sm font-extrabold tracking-wide text-brand ring-1 ring-brand/15">
          {discount}
        </div>

        <p className="mt-3 line-clamp-2 text-sm font-semibold text-[#2D2D2D]" dir="auto">
          {offer.title}
        </p>

        {offer.description ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground" dir="auto">
            {offer.description}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}
