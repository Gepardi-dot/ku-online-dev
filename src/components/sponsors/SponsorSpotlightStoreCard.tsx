'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, MapPin } from 'lucide-react';

import { SponsorStoreLiveStatsChip } from '@/components/sponsors/SponsorStoreLiveStatsChip';
import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorOfferPreview, SponsorStore, SponsorStoreLiveStats } from '@/lib/services/sponsors';
import { cn } from '@/lib/utils';

export type SponsorSpotlightCardVariant = 'neon' | 'pulse' | 'minimal';

type SponsorSpotlightStoreCardProps = {
  store: SponsorStore;
  offer?: SponsorOfferPreview | null;
  productImageUrls?: string[];
  cityLabel?: string | null;
  href: string;
  locale: Locale;
  variant?: SponsorSpotlightCardVariant;
  className?: string;
  initialStats: SponsorStoreLiveStats | null;
  viewsLabel: string;
  likesLabel: string;
  sponsoredLabel?: string;
  showLiveStats?: boolean;
};

function recordStoreClick(payload: { storeId: string; locale: string }) {
  const body = JSON.stringify({
    storeId: payload.storeId,
    locale: payload.locale,
    source: 'spotlight_card',
  });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/sponsors/stats/click', blob);
      return;
    }
  } catch {
    // no-op
  }

  fetch('/api/sponsors/stats/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // no-op
  });
}

export function SponsorSpotlightStoreCard({
  store,
  offer,
  cityLabel,
  href,
  locale,
  className,
  initialStats,
  viewsLabel,
  likesLabel,
  showLiveStats = true,
}: SponsorSpotlightStoreCardProps) {
  const cardSrc = store.coverUrl?.trim() || '';
  const description = store.description?.trim() || null;

  return (
    <Link
      href={href}
      className={cn(
        'group relative block overflow-hidden rounded-[26px] border border-white/75 bg-white/90 ring-1 ring-white/60 backdrop-blur-[1px] transition duration-300',
        'shadow-[0_14px_40px_rgba(15,23,42,0.14)] hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(15,23,42,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35',
        className,
      )}
      onClick={() => {
        recordStoreClick({ storeId: store.id, locale });
      }}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_12%_12%,#f3f4f6_0%,#d1d5db_55%,#9ca3af_100%)]">
        {cardSrc ? (
          <Image
            src={cardSrc}
            alt={`${store.name} store card`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 560px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        {!cardSrc ? (
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.35),rgba(255,255,255,0.0)_55%)]" />
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand/18 blur-2xl" />
            <div className="absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute inset-0 [background:repeating-linear-gradient(125deg,rgba(255,255,255,0.08)_0px,rgba(255,255,255,0.08)_2px,transparent_2px,transparent_12px)]" />
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/68 via-black/24 to-black/12" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0)_38%)]" />

        {showLiveStats ? (
          <div className="absolute bottom-3 left-3">
            <SponsorStoreLiveStatsChip
              storeId={store.id}
              locale={locale}
              initialStats={initialStats}
              viewsLabel={viewsLabel}
              likesLabel={likesLabel}
              className="!px-2.5 !py-1 shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
            />
          </div>
        ) : null}
      </div>

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-base font-extrabold text-[#111827]" dir="auto">
              {store.name}
            </h3>
            {cityLabel ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground" dir="auto">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
                <span className="line-clamp-1">{cityLabel}</span>
              </p>
            ) : null}
          </div>

          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand ring-1 ring-brand/15 transition group-hover:bg-brand group-hover:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        {offer?.title ? (
          <p className="mt-2 line-clamp-1 text-sm font-semibold text-brand" dir="auto">
            {offer.title}
          </p>
        ) : null}

        {description ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground" dir="auto">
            {description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
