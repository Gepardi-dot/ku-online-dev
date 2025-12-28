'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Eye, BadgeCheck } from 'lucide-react';
import type { ProductWithRelations } from '@/lib/services/products';
import FavoriteToggle from '@/components/product/favorite-toggle';
import { useLocale } from '@/providers/locale-provider';
import { localizeText } from '@/lib/locale/localize';
import { rtlLocales } from '@/lib/locale/dictionary';
import { CurrencyText } from '@/components/currency-text';

interface ProductCardProps {
  product: ProductWithRelations;
  viewerId?: string | null;
  searchQuery?: string | null;
}

export default function ProductCard({ product, viewerId, searchQuery }: ProductCardProps) {
  const { t, locale, messages } = useLocale();
  const isRtl = rtlLocales.includes(locale);
  const cityLabels = messages.header.city as Record<string, string>;
  const getCityLabel = (value: string) => cityLabels[value.trim().toLowerCase()] ?? value;
  const localizedTitle = localizeText(product.title, product.titleTranslations, locale);

  const recordSearchClick = () => {
    const query = (searchQuery ?? '').trim();
    if (query.length < 2) {
      return;
    }

    const dedupeKey = `search-click:${locale}:${query.toLowerCase()}:${product.id}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) {
        return;
      }
      sessionStorage.setItem(dedupeKey, '1');
    } catch {}

    const payload = JSON.stringify({ query, productId: product.id, locale });

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/search/click', blob);
        return;
      }
    } catch {}

    fetch('/api/search/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  };

  const conditionColorMap: Record<string, string> = {
    new: 'bg-green-500',
    'used - like new': 'bg-blue-500',
    'used - good': 'bg-yellow-500',
    'used - fair': 'bg-orange-500',
  };

  const getConditionColor = (condition?: string | null) => {
    const normalized = (condition ?? '').trim().toLowerCase();
    return conditionColorMap[normalized] ?? 'bg-gray-500';
  };

  const conditionLabels: Record<string, string> = {
    'new': t('filters.conditionNew'),
    'used - like new': t('filters.conditionLikeNew'),
    'used - good': t('filters.conditionGood'),
    'used - fair': t('filters.conditionFair'),
  };

  const getConditionLabel = (value?: string | null) => {
    if (!value) return t('filters.conditionNew');
    const normalized = value.trim().toLowerCase();
    return conditionLabels[normalized] ?? value;
  };

  const sellerDisplayNameRaw = product.seller?.fullName ?? product.seller?.name ?? product.seller?.email ?? '';
  const sellerDisplayName = sellerDisplayNameRaw.trim() || messages.product.sellerFallback;
  const conditionLabel = getConditionLabel(product.condition || 'New');
  const titleLength = localizedTitle.trim().length;
  const titleSizeClass = titleLength > 52
    ? 'text-[0.78rem] sm:text-[0.85rem] leading-snug'
    : titleLength > 40
      ? 'text-[0.85rem] sm:text-[0.9rem] leading-snug'
      : titleLength > 28
        ? 'text-[0.9rem] sm:text-[0.95rem] leading-tight'
        : 'text-[0.95rem] sm:text-base leading-tight';

  return (
    <Link
      href={`/product/${product.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      prefetch
      onClick={recordSearchClick}
    >
      <Card className="flex h-full flex-col overflow-hidden transition-all duration-300 group-hover:shadow-lg">
        {/* Responsive image container:
            - Mobile: height scales with viewport width using clamp for regular/pro/plus sizes
            - Desktop: fixed pleasing card ratio via aspect-ratio */}
        <div className="relative w-full h-[clamp(160px,45vw,230px)] md:h-auto md:aspect-[4/3] overflow-hidden">
          <Image
            src={product.imageUrls?.[0] || 'https://picsum.photos/400/300'}
            alt={localizedTitle}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {product.isSold && (
            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
              <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-white/90 text-gray-900 rounded">
                {t('product.soldBadge')}
              </span>
            </div>
          )}
          <div
            className="absolute top-2 right-2"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <FavoriteToggle productId={product.id} userId={viewerId} size="sm" />
          </div>
        <div className="absolute top-2 left-2">
          <Badge className={`text-white ${getConditionColor(product.condition || 'New')}`}>
            {conditionLabel}
          </Badge>
        </div>
        {product.isPromoted && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="bg-yellow-400 text-black">
              Featured
            </Badge>
          </div>
        )}
        </div>

        <CardContent
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`flex h-[146px] flex-col justify-between overflow-hidden px-3 py-3 ${isRtl ? 'text-right' : 'text-left'}`}
        >
        <div className="space-y-1">
          <h3
            dir="auto"
            className={`min-h-[2.4rem] font-bold ${titleSizeClass} line-clamp-2 bidi-auto`}
          >
            {localizedTitle}
          </h3>
          
          <div className="flex items-center justify-start gap-2">
            <CurrencyText
              amount={Number(product.price)}
              currencyCode={product.currency ?? null}
              locale={locale}
              className="text-lg font-bold text-primary bidi-auto"
            />
          </div>
          
          <div
            className={`flex items-center gap-2 ${
              product.location ? 'justify-between' : isRtl ? 'justify-start' : 'justify-end'
            }`}
          >
            {product.location ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                <MapPin className="h-3 w-3" />
                <span dir="auto" className="bidi-auto">
                  {getCityLabel(product.location)}
                </span>
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <Eye className="h-3 w-3" />
              <span dir="auto" className="bidi-auto">
                {product.views}
              </span>
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 bidi-auto"
            >
              <span dir="auto" className="truncate bidi-auto">
                {sellerDisplayName}
              </span>
              {product.seller?.isVerified ? (
                <>
                  <BadgeCheck className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                  <span className="sr-only">{t('profile.overview.trustedBadge')}</span>
                </>
              ) : null}
            </span>
          </div>
        </div>
        </CardContent>
      </Card>
    </Link>
  );
}
