'use client';

import Image from 'next/image';
import Link from 'next/link';

import { CurrencyText } from '@/components/currency-text';
import { SponsorStoreBasketButton } from '@/components/sponsors/SponsorStoreBasketButton';
import type { Locale } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';

export type SponsorStoreProductCardModel = {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  currency: string | null;
  imageUrl: string | null;
  href?: string | null;
};

type SponsorStoreProductCardProps = {
  item: SponsorStoreProductCardModel;
  locale: Locale;
  basketKey?: string | null;
  className?: string;
};

function computePercentOff(originalPrice: number, dealPrice: number): number | null {
  if (!(originalPrice > 0) || !(dealPrice >= 0) || dealPrice > originalPrice) return null;
  const pct = Math.round((1 - dealPrice / originalPrice) * 100);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return pct;
}

export function SponsorStoreProductCard({ item, locale, basketKey, className }: SponsorStoreProductCardProps) {
  const href = item.href?.trim() || null;
  const imageSrc = item.imageUrl?.trim() || 'https://picsum.photos/600/450';

  const original =
    typeof item.originalPrice === 'number' && Number.isFinite(item.originalPrice) && item.originalPrice > item.price
      ? item.originalPrice
      : null;
  const percentOff = original ? computePercentOff(original, item.price) : null;

  const card = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[18px] border border-white/70 bg-white/75 shadow-[0_10px_30px_rgba(15,23,42,0.10)] ring-1 ring-white/40 transition',
        href ? 'active:scale-[0.99] sm:hover:shadow-[0_14px_38px_rgba(15,23,42,0.14)]' : null,
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, 220px"
          className={cn('object-cover transition duration-500', href ? 'sm:group-hover:scale-[1.04]' : null)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

        {percentOff ? (
          <div className="absolute left-2 top-2 rounded-lg bg-[#F28C34] px-2.5 py-1 text-[0.78rem] font-extrabold leading-none text-white shadow-[0_4px_10px_rgba(242,140,52,0.45)]">
            -{percentOff}%
          </div>
        ) : null}

        {basketKey ? (
          <div
            className="absolute right-2 top-2"
            onClick={(event) => {
              // Prevent navigation; MVP basket is a lead-gen list.
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <SponsorStoreBasketButton
              basketKey={basketKey}
              item={{
                id: item.id,
                title: item.title,
                price: item.price,
                currency: item.currency,
                href,
                imageUrl: item.imageUrl,
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="relative p-2.5">
        <p className="line-clamp-2 text-[0.85rem] font-semibold leading-snug text-[#111827]" dir="auto">
          {item.title}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            {original ? (
              <div className="text-[0.85rem] font-semibold text-[#DA291C] line-through decoration-1" dir="auto">
                <CurrencyText amount={original} currencyCode={item.currency} locale={locale} />
              </div>
            ) : null}
            <span className="text-[1.1rem] font-extrabold text-brand" dir="auto">
              <CurrencyText amount={item.price} currencyCode={item.currency} locale={locale} />
            </span>
          </div>
        </div>
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
