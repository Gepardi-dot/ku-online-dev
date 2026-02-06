import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';
import type { SponsorStore } from '@/lib/services/sponsors';

type SponsorStoreBannerCardProps = {
  store: SponsorStore;
  sponsoredLabel: string;
  cityLabel?: string | null;
  subtitle?: string | null;
  href?: string | null;
  className?: string;
};

export function SponsorStoreBannerCard({
  store,
  sponsoredLabel,
  cityLabel,
  subtitle,
  href,
  className,
}: SponsorStoreBannerCardProps) {
  const coverSrc = store.coverUrl?.trim() || '';
  const logoSrc = store.logoUrl?.trim() || '';

  const card = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[32px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 shadow-[0_14px_46px_rgba(15,23,42,0.14)] ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-[0_18px_60px_rgba(15,23,42,0.18)]',
        href ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
    >
      <div className="absolute inset-0">
        {coverSrc ? (
          <>
            <Image
              src={coverSrc}
              alt=""
              fill
              sizes="(max-width: 768px) 92vw, 520px"
              className="object-cover opacity-80 transition duration-500 group-hover:scale-[1.04]"
              priority={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/96 via-white/62 to-white/18" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.22),rgba(255,255,255,0.0)_55%)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.22),rgba(255,255,255,0.0)_55%)]" />
        )}
      </div>

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/85 shadow-sm ring-1 ring-black/5">
              {logoSrc ? (
                <Image src={logoSrc} alt="" fill sizes="48px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg" aria-hidden="true">
                  🏪
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-1 text-base font-semibold text-[#2D2D2D]" dir="auto">
                {store.name}
              </p>
              {cityLabel ? (
                <p className="line-clamp-1 text-xs font-semibold text-muted-foreground" dir="auto">
                  {cityLabel}
                </p>
              ) : null}
            </div>
          </div>
          <SponsoredBadge label={sponsoredLabel} />
        </div>

        {subtitle ? (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground" dir="auto">
            {subtitle}
          </p>
        ) : store.description ? (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground" dir="auto">
            {store.description}
          </p>
        ) : null}

        <div className="mt-4 inline-flex items-center rounded-full bg-white/75 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
          Tap to view offers
        </div>
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

