import Image from 'next/image';
import Link from 'next/link';
import { VerifiedBadge } from '@/components/ui/verified-badge';

import type { SponsorOfferPreview, SponsorStore } from '@/lib/services/sponsors';
import type { Locale } from '@/lib/locale/dictionary';
import { applyArabicComma, getNumberLocale } from '@/lib/locale/formatting';
import { cn } from '@/lib/utils';
import { SponsoredBadge } from '@/components/sponsors/SponsoredBadge';

type SponsorSpotlightStoreCardProps = {
  store: SponsorStore;
  offer?: SponsorOfferPreview | null;
  sponsoredLabel: string;
  cityLabel?: string | null;
  href: string;
  locale: Locale;
  className?: string;
};

function getInitials(name: string): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) return 'KU';
  const parts = cleaned.split(/\s+/g).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return `${first}${second}`.toUpperCase();
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function createRng(seed: number) {
  // Deterministic pseudo-random generator so each store has a unique (but stable) motion pattern.
  let state = seed || 1;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function pickTintClasses(seed: string) {
  const palette = [
    {
      overlay: 'from-[#F97316]/92 via-[#F97316]/62 to-black/15',
      accent: 'text-amber-200',
    },
    {
      overlay: 'from-[#EC4899]/88 via-[#EC4899]/55 to-black/18',
      accent: 'text-rose-200',
    },
    {
      overlay: 'from-[#2563EB]/86 via-[#2563EB]/52 to-black/20',
      accent: 'text-sky-200',
    },
    {
      overlay: 'from-[#16A34A]/84 via-[#16A34A]/48 to-black/22',
      accent: 'text-emerald-200',
    },
  ] as const;

  const idx = seed ? stableHash(seed) % palette.length : 0;
  return palette[idx]!;
}

function formatDiscountLabel(offer: SponsorOfferPreview, locale: Locale): string | null {
  const value = offer.discountValue;
  if (offer.discountType === 'percent' && typeof value === 'number') {
    return `${Math.round(value)}% OFF`;
  }
  if (offer.discountType === 'amount' && typeof value === 'number') {
    const formatted = applyArabicComma(
      new Intl.NumberFormat(getNumberLocale(locale), { maximumFractionDigits: 0 }).format(value),
      locale,
    );
    const currency = (offer.currency ?? '').trim();
    return currency ? `${formatted} ${currency} OFF` : `${formatted} OFF`;
  }
  if (offer.discountType === 'freebie') {
    return 'FREEBIE';
  }
  return offer.title?.trim() ? offer.title.trim() : null;
}

function formatMoney(amount: number, currency: string | null, locale: Locale): { prefix: string; value: string; suffix: string } {
  const code = (currency ?? '').trim().toUpperCase();
  const prefix = code === 'USD' || code === '$' ? '$' : '';
  const suffix = prefix ? '' : code ? ` ${code}` : '';
  const decimals = code === 'IQD' || code === 'د.ع' ? 0 : amount < 100 ? 2 : 0;
  const value = applyArabicComma(
    new Intl.NumberFormat(getNumberLocale(locale), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount),
    locale,
  );
  return { prefix, value, suffix };
}

function computePercentOff(original: number, deal: number): number | null {
  if (!(original > 0) || !(deal >= 0) || deal > original) return null;
  const pct = Math.round((1 - deal / original) * 100);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return pct;
}

export function SponsorSpotlightStoreCard({
  store,
  offer,
  sponsoredLabel,
  cityLabel,
  href,
  locale,
  className,
}: SponsorSpotlightStoreCardProps) {
  const coverSrc = store.coverUrl?.trim() || '';
  const logoSrc = store.logoUrl?.trim() || '';
  const isRtl = locale === 'ar' || locale === 'ku';
  const motionSeed = stableHash(`${store.slug || store.id}:${store.updatedAt?.toISOString?.() ?? ''}`);
  const rng = createRng(motionSeed);
  const tint = pickTintClasses(store.slug || store.id);
  const initials = getInitials(store.name);
  const discountLabel = offer ? formatDiscountLabel(offer, locale) : null;

  const originalPrice =
    offer && typeof offer.originalPrice === 'number' && Number.isFinite(offer.originalPrice) ? offer.originalPrice : null;
  const dealPrice = offer && typeof offer.dealPrice === 'number' && Number.isFinite(offer.dealPrice) ? offer.dealPrice : null;
  const percentFromPrices =
    typeof originalPrice === 'number' && typeof dealPrice === 'number' ? computePercentOff(originalPrice, dealPrice) : null;
  const percentFromDiscount =
    offer?.discountType === 'percent' && typeof offer.discountValue === 'number' ? Math.round(offer.discountValue) : null;
  const percentOff = percentFromPrices ?? (percentFromDiscount && percentFromDiscount > 0 ? percentFromDiscount : null);

  const borderDuration = 5.6 + rng() * 3.6; // 5.6s–9.2s
  const borderDelay = -rng() * borderDuration;
  const auroraDuration = 14 + rng() * 12; // 14s–26s
  const sparkleDuration = 3.4 + rng() * 3.6; // 3.4s–7s

  const beamCount = 3 + (rng() > 0.66 ? 1 : 0); // 3–4
  const beams = Array.from({ length: beamCount }).map((_, idx) => {
    const isWarm = rng() > 0.55;
    const widthPct = 28 + rng() * 28; // 28%–56%
    const opacity = 0.16 + rng() * 0.22; // 0.16–0.38
    const duration = 1.65 + rng() * 1.35; // 1.65s–3.0s
    const delay = -rng() * duration;
    const left = -(25 + rng() * 35); // -25% to -60%
    const key = `${store.id}-beam-${idx}`;
    return { key, isWarm, widthPct, opacity, duration, delay, left };
  });

  return (
    <Link
      href={href}
      className={cn(
        // Animated border to "stop the scroll" (always-on, reduced-motion safe).
        'group relative block rounded-[30px] p-[1.5px] shadow-[0_18px_54px_rgba(15,23,42,0.16)] transition active:scale-[0.99]',
        'bg-[linear-gradient(110deg,rgba(247,111,29,0.55),rgba(255,255,255,0.35),rgba(59,130,246,0.35),rgba(255,255,255,0.30),rgba(247,111,29,0.55))]',
        'bg-[length:220%_220%] motion-safe:animate-borderShift motion-reduce:bg-white/40',
        'hover:-translate-y-0.5 hover:shadow-[0_22px_64px_rgba(15,23,42,0.20)]',
        className,
      )}
      style={
        {
          animationDuration: `${borderDuration.toFixed(2)}s`,
          animationDelay: `${borderDelay.toFixed(2)}s`,
        } as React.CSSProperties
      }
    >
      <div className="relative h-[178px] overflow-hidden rounded-[28px] ring-1 ring-white/25 md:h-[196px]">
        <div className="absolute inset-0">
          {coverSrc ? (
            <Image
              src={coverSrc}
              alt=""
              fill
              sizes="(max-width: 768px) 92vw, 560px"
              className="object-cover opacity-95 transition duration-700 group-hover:scale-[1.04]"
              priority={false}
            />
          ) : null}

          <div className={cn('absolute inset-0 bg-gradient-to-br backdrop-blur-[1px] opacity-90', tint.overlay)} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/42 via-black/18 to-transparent" />

          {/* Always-on motion accents (respect reduced-motion) */}
          <div
            className="pointer-events-none absolute inset-0 opacity-70 motion-safe:animate-aurora motion-reduce:opacity-40"
            style={
              {
                animationDuration: `${auroraDuration.toFixed(2)}s`,
                animationDelay: `${(-rng() * auroraDuration).toFixed(2)}s`,
              } as React.CSSProperties
            }
          >
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/18 blur-3xl" />
            <div className="absolute -right-16 -bottom-24 h-64 w-64 rounded-full bg-white/14 blur-3xl" />
          </div>

          {/* Infinite shimmer beams with per-card variance (no cards move in sync). */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {beams.map((beam) => (
              <div
                key={beam.key}
                className={cn(
                  'absolute top-0 h-full motion-reduce:hidden',
                  'bg-gradient-to-r from-transparent',
                  beam.isWarm ? 'via-amber-200/40 to-transparent mix-blend-screen' : 'via-white/40 to-transparent',
                )}
                style={
                  {
                    left: `${beam.left}%`,
                    width: `${beam.widthPct}%`,
                    opacity: beam.opacity,
                    animationName: 'ku-shimmer',
                    animationDuration: `${beam.duration.toFixed(2)}s`,
                    animationTimingFunction: 'linear',
                    animationIterationCount: 'infinite',
                    animationDelay: `${beam.delay.toFixed(2)}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>

          {/* Sparkle dust (subtle but attention-grabbing) */}
          <div
            className="pointer-events-none absolute inset-0 mix-blend-screen opacity-80 motion-safe:animate-sparkle motion-reduce:hidden"
            style={
              {
                animationDuration: `${sparkleDuration.toFixed(2)}s`,
                animationDelay: `${(-rng() * sparkleDuration).toFixed(2)}s`,
              } as React.CSSProperties
            }
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.55)_0px,transparent_2px),radial-gradient(circle_at_72%_18%,rgba(255,255,255,0.35)_0px,transparent_2px),radial-gradient(circle_at_88%_62%,rgba(255,255,255,0.40)_0px,transparent_2px),radial-gradient(circle_at_34%_78%,rgba(255,255,255,0.30)_0px,transparent_2px)]" />
          </div>
        </div>

        <div className="relative flex h-full flex-col justify-between p-4 md:p-5">
        <div className={cn('absolute top-3 z-10', isRtl ? 'left-3' : 'right-3')}>
          <SponsoredBadge
            label={sponsoredLabel}
            className="inline-flex rounded-full border-[#E7D2A3]/30 bg-[#E7D2A3]/85 px-3 py-1 text-[11px] font-bold tracking-wide text-[#2D2D2D] shadow-sm"
          />
        </div>
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white/25 ring-2 ring-white/40 shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
              {logoSrc ? (
                <Image src={logoSrc} alt="" fill sizes="48px" className="object-cover opacity-95" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base font-extrabold text-white/85" aria-hidden="true">
                  {initials}
                </div>
              )}
            </div>

            <div className={cn('min-w-0', isRtl ? 'pl-20 md:pl-24' : 'pr-20 md:pr-24')}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words text-xl font-extrabold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]" dir="auto">
                  {store.name}
                </p>
                <VerifiedBadge
                  size="sm"
                  label="Verified"
                  className="h-6 w-6 justify-center rounded-full ring-2 ring-white/35 shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
                />
              </div>
              {cityLabel ? (
                <p className="line-clamp-1 text-sm font-semibold text-white/80 drop-shadow-[0_2px_10px_rgba(0,0,0,0.30)]" dir="auto">
                  {cityLabel}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-2 min-h-0">
          {store.description ? (
            <p className="line-clamp-2 text-sm font-medium text-white/88 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]" dir="auto">
              {store.description}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
            <div className={cn('min-w-0', isRtl ? 'pl-20 md:pl-24' : 'pr-20 md:pr-24')}>
            {typeof originalPrice === 'number' && typeof dealPrice === 'number' ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {(() => {
                  const orig = formatMoney(originalPrice, offer?.currency ?? null, locale);
                  const deal = formatMoney(dealPrice, offer?.currency ?? null, locale);
                  return (
                    <>
                      <span className="text-lg font-semibold text-white/65 line-through drop-shadow-[0_2px_14px_rgba(0,0,0,0.40)]">
                        {orig.prefix}
                        {orig.value}
                        {orig.suffix}
                      </span>
                      <span className="text-xl font-extrabold text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.40)]">
                        {deal.prefix}
                        {deal.value}
                        {deal.suffix}
                      </span>
                    </>
                  );
                })()}
                {percentOff ? (
                  <span className={cn('text-sm font-extrabold drop-shadow-[0_2px_14px_rgba(0,0,0,0.40)]', tint.accent)}>
                    ({percentOff}% OFF)
                  </span>
                ) : null}
              </div>
            ) : discountLabel ? (
              <p className="text-xl font-extrabold text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.40)]" dir="auto">
                {discountLabel}
                {percentOff ? <span className={cn('ml-2 text-sm font-extrabold', tint.accent)}>( {percentOff}% OFF )</span> : null}
              </p>
            ) : null}
          </div>

        </div>
      </div>
      </div>
    </Link>
  );
}
