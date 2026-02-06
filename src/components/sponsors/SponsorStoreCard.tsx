import Image from 'next/image';
import Link from 'next/link';

import type { SponsorStore } from '@/lib/services/sponsors';
import { cn } from '@/lib/utils';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';

type SponsorStoreCardProps = {
  store: SponsorStore;
  sponsoredLabel: string;
  cityLabel?: string | null;
  href?: string | null;
  className?: string;
};

export function SponsorStoreCard({ store, sponsoredLabel, cityLabel, href, className }: SponsorStoreCardProps) {
  const coverSrc = store.coverUrl?.trim() || '';
  const logoSrc = store.logoUrl?.trim() || '';

  const card = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[28px] border border-white/60 bg-linear-to-br from-white/70 via-white/60 to-white/40 shadow-[0_10px_40px_rgba(15,23,42,0.12)] ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.16)]',
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
              sizes="(max-width: 768px) 50vw, 33vw"
              className="object-cover opacity-65 transition duration-500 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/92 via-white/60 to-white/25" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(247,111,29,0.18),rgba(255,255,255,0.0)_55%)]" />
        )}
      </div>

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/80 shadow-sm ring-1 ring-black/5">
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
                <p className="line-clamp-1 text-xs font-medium text-muted-foreground" dir="auto">
                  {cityLabel}
                </p>
              ) : null}
            </div>
          </div>

          <SponsoredBadge label={sponsoredLabel} />
        </div>

        {store.description ? (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground" dir="auto">
            {store.description}
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
