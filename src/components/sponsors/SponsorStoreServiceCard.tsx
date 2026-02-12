import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ar, ckb, enUS } from 'date-fns/locale';

import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorOffer } from '@/lib/services/sponsors';
import { cn } from '@/lib/utils';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';
import { applyArabicComma, getNumberLocale } from '@/lib/locale/formatting';

type SponsorStoreServiceCardProps = {
  offer: SponsorOffer;
  locale: Locale;
  sponsoredLabel: string;
  endsLabel: (time: string) => string;
  href?: string | null;
  className?: string;
  compact?: boolean;
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

export function SponsorStoreServiceCard({
  offer,
  locale,
  sponsoredLabel,
  endsLabel,
  href,
  className,
  compact = false,
}: SponsorStoreServiceCardProps) {
  const discount = formatDiscount(offer, locale);
  const dateFnsLocale = getDateFnsLocale(locale);
  const endsIn = offer.endAt ? formatDistanceToNow(offer.endAt, { addSuffix: true, locale: dateFnsLocale }) : null;

  const card = (
    <div
      className={cn(
        'group relative shrink-0 overflow-hidden border border-white/70 bg-white/75 ring-1 ring-white/40 transition',
        compact
          ? 'rounded-2xl shadow-[0_8px_22px_rgba(15,23,42,0.09)]'
          : 'rounded-[18px] shadow-[0_10px_30px_rgba(15,23,42,0.10)]',
        href ? 'active:scale-[0.99] sm:hover:shadow-[0_14px_38px_rgba(15,23,42,0.14)]' : null,
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.16),rgba(255,255,255,0.0)_55%)]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-55 motion-safe:opacity-65">
        <div className="absolute -left-1/2 top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent motion-safe:animate-shimmer motion-reduce:hidden" />
      </div>
      <div className={cn('relative', compact ? 'p-2.5' : 'p-3')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span
              className={cn(
                'inline-flex items-center rounded-full bg-brand/12 font-extrabold text-brand ring-1 ring-brand/15',
                compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
              )}
            >
              {discount}
            </span>
            {endsIn ? (
              <p
                className={cn(
                  'font-semibold text-muted-foreground',
                  compact ? 'mt-0.5 text-[0.67rem]' : 'mt-1 text-[0.72rem]',
                )}
                dir="auto"
              >
                {endsLabel(endsIn)}
              </p>
            ) : null}
          </div>
          <SponsoredBadge label={sponsoredLabel} className={compact ? 'rounded-md px-2 py-0.5 text-[10px]' : undefined} />
        </div>

        <p className={cn('line-clamp-2 font-bold text-[#111827]', compact ? 'mt-1.5 text-[0.82rem]' : 'mt-2 text-sm')} dir="auto">
          {offer.title}
        </p>
        {offer.description ? (
          <p
            className={cn(
              'line-clamp-2 font-medium text-muted-foreground',
              compact ? 'mt-0.5 text-[0.72rem]' : 'mt-1 text-[0.78rem]',
            )}
            dir="auto"
          >
            {offer.description}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {card}
      </Link>
    );
  }

  return card;
}
