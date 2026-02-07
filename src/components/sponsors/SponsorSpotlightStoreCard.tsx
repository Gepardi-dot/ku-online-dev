'use client';

import Image from 'next/image';
import Link from 'next/link';

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
  href,
  locale,
  className,
  initialStats,
  viewsLabel,
  likesLabel,
  showLiveStats = true,
}: SponsorSpotlightStoreCardProps) {
  const cardSrc = store.coverUrl?.trim() || '';

  return (
    <Link
      href={href}
      className={cn(
        'group relative block overflow-hidden rounded-[28px] border border-white/45 bg-white transition',
        'shadow-[0_14px_38px_rgba(2,6,23,0.24)] hover:-translate-y-0.5 hover:shadow-[0_20px_46px_rgba(2,6,23,0.32)]',
        className,
      )}
      onClick={() => {
        recordStoreClick({ storeId: store.id, locale });
      }}
    >
      <div className="relative aspect-[16/9] bg-[linear-gradient(120deg,#e2e8f0,#f8fafc)]">
        {cardSrc ? (
          <Image
            src={cardSrc}
            alt={`${store.name} store card`}
            fill
            sizes="(max-width: 768px) 100vw, 560px"
            className="object-cover"
          />
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/5" />

        {showLiveStats ? (
          <div className="absolute bottom-2.5 left-2.5">
            <SponsorStoreLiveStatsChip
              storeId={store.id}
              locale={locale}
              initialStats={initialStats}
              viewsLabel={viewsLabel}
              likesLabel={likesLabel}
            />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
