
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MapPin, Eye, BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChatButton from '@/components/chat/chat-button';
import MarkSoldToggle from '@/components/product/mark-sold-toggle';
import ReviewSystem from '@/components/reviews/review-system';
import SimilarItems from '@/components/product/similar-items';
import { ReportListingDialog } from '@/components/reports/ReportListingDialog';
import { differenceInMonths } from 'date-fns';
import { getProductById, incrementProductViews } from '@/lib/services/products';
import ProductImages from '@/components/product/product-images';
import { getProductFavoriteCount } from '@/lib/services/favorites-analytics';
import Link from 'next/link';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';

const placeholderReviews = [
  {
    id: '1',
    rating: 5,
    comment: 'Great seller! Item exactly as described. Fast delivery.',
    buyerName: 'Sarah M.',
    buyerAvatar: 'https://picsum.photos/seed/buyer1/40/40',
    createdAt: '2024-01-10T10:00:00Z',
    isAnonymous: false,
  },
  {
    id: '2',
    rating: 4,
    comment: 'Good quality product. Seller was responsive.',
    buyerName: 'Anonymous',
    createdAt: '2024-01-05T10:00:00Z',
    isAnonymous: true,
  },
];
interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  const cookieStore = await cookies();
  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);
  const supabase = await createClient(cookieStore);

  const [{ data: { user } = { user: null } }, product] = await Promise.all([
    supabase.auth.getUser(),
    getProductById(id),
  ]);

  if (!product) {
    notFound();
  }

  incrementProductViews(product.id).catch((error) => {
    console.error('Failed to increment product views', error);
  });

  const numberLocale = locale === 'ku' ? 'ku-Arab-IQ' : locale === 'ar' ? 'ar-IQ' : 'en-US';
  const numberFormatter = new Intl.NumberFormat(numberLocale);
  const formatNumber = (value: number) => numberFormatter.format(value);

  const currencyLabel = locale === 'ar' || locale === 'ku' ? 'دينار' : 'IQD';

  const formatPrice = (price: number, currency: string | null) => {
    const formatter = new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: currency ?? 'IQD',
      currencyDisplay: 'code',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    return formatter.format(price).replace(/IQD/g, currencyLabel).trim();
  };

  const conditionLabels: Record<string, string> = {
    'new': t('filters.conditionNew'),
    'used - like new': t('filters.conditionLikeNew'),
    'used - good': t('filters.conditionGood'),
    'used - fair': t('filters.conditionFair'),
  };

  const getConditionLabel = (value: string | null | undefined) => {
    if (!value) {
      return t('product.conditionUnknown');
    }
    const normalized = value.trim().toLowerCase();
    return conditionLabels[normalized] ?? value;
  };

  const getConditionColor = (condition: string | null | undefined) => {
    switch (condition) {
      case 'New':
        return 'bg-green-500';
      case 'Used - Like New':
        return 'bg-blue-500';
      case 'Used - Good':
        return 'bg-yellow-500';
      case 'Used - Fair':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  const rawImages = product.imageUrls.length > 0 ? product.imageUrls : ['https://placehold.co/800x600?text=KU-ONLINE'];
  const seller = product.seller;
  const sellerId = seller?.id ?? product.sellerId;
  const viewerId = user?.id ?? null;
  const isOwner = Boolean(viewerId && sellerId && viewerId === sellerId);
  const daysSince = (date: Date | null | undefined) => (date ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000)) : null);
  const createdDays = daysSince(product.createdAt);
  const formatDaysAgo = (days: number) => {
    if (locale === 'ar') {
      if (days === 0) return 'اليوم';
      if (days === 1) return 'أمس';
      if (days === 2) return 'منذ يومين';
      return `منذ ${formatNumber(days)} أيام`;
    }
    if (locale === 'en') {
      if (days === 0) return 'Today';
      if (days === 1) return '1 day ago';
      if (days < 30) return `${formatNumber(days)} days ago`;
      if (days < 365) {
        const months = Math.max(1, Math.floor(days / 30));
        return `${formatNumber(months)} month${months === 1 ? '' : 's'} ago`;
      }
      const years = Math.max(1, Math.floor(days / 365));
      return `${formatNumber(years)} year${years === 1 ? '' : 's'} ago`;
    }

    return t('product.daysAgo').replace('{days}', formatNumber(days));
  };

  const createdAtLabel = createdDays !== null ? formatDaysAgo(createdDays) : '';
  const sellerJoinedLabel = (() => {
    if (!seller?.createdAt) {
      return null;
    }

    const months = Math.max(1, differenceInMonths(new Date(), seller.createdAt));
    const numberLocale = locale === 'ar' || locale === 'ku' ? `${locale}-u-nu-arab` : locale;
    const count = new Intl.NumberFormat(numberLocale).format(months);
    const unit = t(`product.monthUnit.${months === 1 ? 'one' : 'other'}`);
    return `${count} ${unit}`;
  })();
  const sellerDisplayNameRaw = seller?.fullName ?? seller?.name ?? seller?.email ?? '';
  const sellerDisplayName = sellerDisplayNameRaw.trim() || 'Seller';
  const sellerInitial = sellerDisplayName.charAt(0).toUpperCase();

  const favoriteCount = await getProductFavoriteCount(product.id);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    image: rawImages,
    offers: {
      '@type': 'Offer',
      priceCurrency: product.currency ?? 'IQD',
      price: product.price,
      availability: product.isSold ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    },
    seller: seller
      ? {
          '@type': 'Person',
          name: seller.fullName ?? seller.name ?? seller.email ?? undefined,
        }
      : undefined,
  };

  // Build canonical URL for sharing
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const shareUrl = base ? `${base}/product/${product.id}` : `/product/${product.id}`;

  const cityLabels = MARKET_CITY_OPTIONS.reduce<Record<string, string>>((acc, option) => {
    const key = option.value.toLowerCase();
    acc[key] = serverTranslate(locale, `header.city.${key}`);
    return acc;
  }, {});

  const getCityLabel = (value: string | null | undefined) => {
    if (!value) return value ?? '';
    const normalized = value.trim().toLowerCase();
    return cityLabels[normalized] ?? value;
  };

  return (
    <AppLayout user={user}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div className="relative">
                <ProductImages
                  images={rawImages}
                  title={product.title}
                  productId={product.id}
                  viewerId={viewerId}
                  initialFavoriteCount={favoriteCount}
                  shareUrl={shareUrl}
                />
              </div>

              <ReviewSystem
                sellerId={seller?.id ?? product.sellerId}
                productId={product.id}
                averageRating={seller?.rating ?? 0}
                totalReviews={seller?.totalRatings ?? 0}
                canReview={Boolean(user && user.id !== seller?.id)}
                viewerId={user?.id ?? null}
                variant="compact"
                maxVisibleReviews={1}
              />
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h1 dir="auto" className="text-2xl font-bold bidi-auto">{product.title}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-white ${getConditionColor(product.condition)}`}>
                      {getConditionLabel(product.condition)}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      {formatNumber(product.views)} {t('product.viewsLabel')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    {typeof product.originalPrice === 'number' && product.originalPrice > product.price ? (
                      <div className="text-sm text-muted-foreground line-through">
                        {formatPrice(product.originalPrice, product.currency)}
                      </div>
                    ) : null}
                    <div className="text-3xl font-bold text-primary">
                      {formatPrice(product.price, product.currency)}
                    </div>
                  </div>
                  {product.isSold && (
                    <Badge variant="secondary" className="bg-gray-700 text-white">
                      {t('product.soldBadge')}
                    </Badge>
                  )}
                </div>

                {(product.location || createdAtLabel) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {product.location && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                        <MapPin className="h-4 w-4" />
                        <span dir="auto" className="bidi-auto">
                          {getCityLabel(product.location)}
                        </span>
                      </span>
                    )}
                    {product.location && createdAtLabel && <span>&bull;</span>}
                    {createdAtLabel && <span>{createdAtLabel}</span>}
                  </div>
                )}

                {product.description && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-2">
                        {t('product.descriptionTitle')}
                      </h3>
                      <p className="text-base text-foreground leading-relaxed">
                        {product.description}
                      </p>
                    </div>
                  </>
                )}

                <Separator />

                <div>
                  <h3 className="font-semibold mb-3">
                    {t('product.sellerInformationTitle')}
                  </h3>
                  <div className="flex items-start gap-3">
                    <Link href={seller?.id ? `/seller/${seller.id}` : '#'} prefetch className="shrink-0">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={seller?.avatar ?? undefined} />
                        <AvatarFallback>{sellerInitial}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span dir="auto" className="inline-flex min-w-0 items-center gap-2 bidi-auto">
                          <Link
                            href={seller?.id ? `/seller/${seller.id}` : '#'}
                            prefetch
                            className="font-medium hover:underline whitespace-nowrap truncate"
                          >
                            {sellerDisplayName}
                          </Link>
                          {seller?.isVerified ? (
                            <>
                              <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                              <span className="sr-only">{t('profile.overview.trustedBadge')}</span>
                            </>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          <span className="text-amber-500">&#9733;</span>
                          <span>
                            {seller?.rating != null ? formatNumber(seller.rating) : t('product.ratingNA')}
                          </span>
                          <span className="font-medium text-amber-700/80">
                            ({formatNumber(seller?.totalRatings ?? 0)} {t('product.reviewsLabel')})
                          </span>
                        </span>
                        {sellerJoinedLabel && (
                          <span
                            dir="auto"
                            className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 bidi-auto"
                          >
                            {t('product.memberSincePrefix')} {sellerJoinedLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  {!isOwner && (
                    <ChatButton
                      sellerId={seller?.id ?? product.sellerId}
                      sellerName={sellerDisplayName}
                      productId={product.id}
                      productTitle={product.title}
                      viewerId={viewerId}
                    />
                  )}
                  {isOwner && (
                    <MarkSoldToggle
                      productId={product.id}
                      sellerId={sellerId ?? ''}
                      viewerId={viewerId}
                      isSold={product.isSold}
                    />
                  )}
                  {isOwner && (
                    <Button asChild variant="secondary" className="w-full">
                      <Link href={`/product/${product.id}/edit`} prefetch>
                        {t('product.editListing')}
                      </Link>
                    </Button>
                  )}
                  <ReportListingDialog productId={product.id} sellerId={seller?.id ?? null} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Suspense
          fallback={(
            <div className="mt-8">
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  {t('product.loadingSimilar')}
                </CardContent>
              </Card>
            </div>
          )}
        >
          <div className="mt-8">
            <SimilarItems productId={product.id} categoryId={product.categoryId} viewerId={user?.id ?? null} />
          </div>
        </Suspense>
      </div>
    </AppLayout>
  );
}
