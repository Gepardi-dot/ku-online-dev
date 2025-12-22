'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Eye, BadgeCheck } from 'lucide-react';
import type { ProductWithRelations } from '@/lib/services/products';
import FavoriteToggle from '@/components/product/favorite-toggle';
import { useLocale } from '@/providers/locale-provider';

interface ProductCardProps {
  product: ProductWithRelations;
  viewerId?: string | null;
  searchQuery?: string | null;
}

export default function ProductCard({ product, viewerId, searchQuery }: ProductCardProps) {
  const { t, locale, messages } = useLocale();
  const cityLabels = messages.header.city as Record<string, string>;
  const getCityLabel = (value: string) => cityLabels[value.trim().toLowerCase()] ?? value;

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

  const formatRelativeTimeEnglish = (date: Date): string => {
    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const totalMinutes = Math.floor(diffMs / 60_000);
    const totalHours = Math.floor(diffMs / 3_600_000);
    const totalDays = Math.floor(diffMs / 86_400_000);

    if (totalMinutes < 60) {
      const minutes = Math.max(1, totalMinutes);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    if (totalHours < 24) {
      const hours = Math.max(1, totalHours);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    if (totalDays < 7) {
      const days = Math.max(1, totalDays);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    if (totalDays < 30) {
      const weeks = Math.max(1, Math.floor(totalDays / 7));
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }

    if (totalDays < 365) {
      const months = Math.max(1, Math.floor(totalDays / 30));
      return `${months} month${months === 1 ? '' : 's'} ago`;
    }

    const years = Math.max(1, Math.floor(totalDays / 365));
    return `${years} year${years === 1 ? '' : 's'} ago`;
  };

  const formatRelativeTimeArabic = (date: Date): string => {
    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const totalMinutes = Math.floor(diffMs / 60_000);
    const totalHours = Math.floor(diffMs / 3_600_000);
    const totalDays = Math.floor(diffMs / 86_400_000);

    if (totalMinutes < 1) {
      return 'الآن';
    }

    const formatNumber = (value: number) => new Intl.NumberFormat('ar-u-nu-arab').format(value);

    if (totalHours < 1) {
      const minutes = Math.max(1, totalMinutes);
      if (minutes === 1) return 'منذ دقيقة';
      if (minutes === 2) return 'منذ دقيقتين';
      return `منذ ${formatNumber(minutes)} دقائق`;
    }

    if (totalHours < 24) {
      const hours = Math.max(1, totalHours);
      if (hours === 1) return 'منذ ساعة';
      if (hours === 2) return 'منذ ساعتين';
      return `منذ ${formatNumber(hours)} ساعات`;
    }

    if (totalDays < 31) {
      const days = Math.max(1, totalDays);
      if (days === 1) return 'منذ يوم';
      if (days === 2) return 'منذ يومين';
      return `منذ ${formatNumber(days)} أيام`;
    }

    const months = Math.floor(totalDays / 30);
    if (months < 12) {
      const normalizedMonths = Math.max(1, months);
      if (normalizedMonths === 1) return 'منذ شهر';
      if (normalizedMonths === 2) return 'منذ شهرين';
      return `منذ ${formatNumber(normalizedMonths)} شهور`;
    }

    const years = Math.max(1, Math.floor(totalDays / 365));
    if (years === 1) return 'منذ سنة';
    if (years === 2) return 'منذ سنتين';
    return `منذ ${formatNumber(years)} سنوات`;
  };

  const formatRelativeTimeKurdish = (date: Date): string => {
    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const totalHours = Math.floor(diffMs / 3_600_000);
    const totalDays = Math.floor(diffMs / 86_400_000);

    const formatNumber = (value: number) => new Intl.NumberFormat('ku-u-nu-arab').format(value);

    if (totalHours < 24) {
      const hours = Math.max(1, totalHours);
      return `پێش ${formatNumber(hours)} ساعة`;
    }

    if (totalDays < 7) {
      const days = Math.max(1, totalDays);
      return `پێش ${formatNumber(days)} ڕۆژ`;
    }

    if (totalDays < 30) {
      const weeks = Math.max(1, Math.floor(totalDays / 7));
      return `پێش ${formatNumber(weeks)} هەفتە`;
    }

    if (totalDays < 365) {
      const months = Math.max(1, Math.floor(totalDays / 30));
      return `پێش ${formatNumber(months)} مانگ`;
    }

    const years = Math.max(1, Math.floor(totalDays / 365));
    return `پێش ${formatNumber(years)} ساڵ`;
  };

  const formatPrice = (price: number, currency?: string | null) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency ?? 'IQD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(price)
        .replace('IQD', 'IQD');
    } catch {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency ?? 'IQD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(price)
        .replace('IQD', 'IQD');
    }
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

  const createdAtLabel = product.createdAt
    ? locale === 'ar'
      ? formatRelativeTimeArabic(product.createdAt)
      : locale === 'ku'
        ? formatRelativeTimeKurdish(product.createdAt)
        : formatRelativeTimeEnglish(product.createdAt)
    : '';
  const sellerDisplayNameRaw = product.seller?.fullName ?? product.seller?.name ?? product.seller?.email ?? '';
  const sellerDisplayName = sellerDisplayNameRaw.trim() || messages.product.sellerFallback;
  const conditionLabel = getConditionLabel(product.condition || 'New');

  return (
    <Link
      href={`/product/${product.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      prefetch
      onClick={recordSearchClick}
    >
      <Card className="overflow-hidden transition-all duration-300 group-hover:shadow-lg">
        {/* Responsive image container:
            - Mobile: height scales with viewport width using clamp for regular/pro/plus sizes
            - Desktop: fixed pleasing card ratio via aspect-ratio */}
        <div className="relative w-full h-[clamp(160px,45vw,230px)] md:h-auto md:aspect-[4/3] overflow-hidden">
          <Image
            src={product.imageUrls?.[0] || 'https://picsum.photos/400/300'}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            unoptimized
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

        <CardContent className="p-3">
        <div className="space-y-2">
          <h3 dir="auto" className="font-semibold text-sm line-clamp-2 leading-tight bidi-auto">
            {product.title}
          </h3>
          
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-primary">
              {formatPrice(Number(product.price), product.currency)}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              {product.views}
            </div>
          </div>
          
          {product.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span dir="auto" className="bidi-auto">
                {getCityLabel(product.location)}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span dir="auto" className="inline-flex items-center gap-1 bidi-auto">
              <span>{sellerDisplayName}</span>
              {product.seller?.isVerified ? (
                <>
                  <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <span className="sr-only">{t('profile.overview.trustedBadge')}</span>
                </>
              ) : null}
            </span>
            <span dir="auto" className="bidi-auto">{createdAtLabel}</span>
          </div>
        </div>
        </CardContent>
      </Card>
    </Link>
  );
}
