
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MapPin, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChatButton from '@/components/chat/chat-button';
import MarkSoldToggle from '@/components/product/mark-sold-toggle';
import ReviewSystem from '@/components/reviews/review-system';
import SimilarItems from '@/components/product/similar-items';
import { ReportListingDialog } from '@/components/reports/ReportListingDialog';
import { formatDistanceToNow } from 'date-fns';
import { getProductById, incrementProductViews } from '@/lib/services/products';
import ProductImages from '@/components/product/product-images';
import FavoriteToggle from '@/components/product/favorite-toggle';
import ShareButton from '@/components/share-button';
import Link from 'next/link';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';

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

  const formatPrice = (price: number, currency: string | null) => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'IQD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    return formatter.format(price).replace('IQD', 'IQD');
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
  const createdAtLabel = product.createdAt ? formatDistanceToNow(product.createdAt, { addSuffix: true }) : '';
  const sellerJoinedLabel = seller?.createdAt ? formatDistanceToNow(seller.createdAt, { addSuffix: true }) : null;

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
          name: seller.fullName ?? seller.email ?? undefined,
        }
      : undefined,
  };

  // Build canonical URL for sharing
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const shareUrl = base ? `${base}/product/${product.id}` : `/product/${product.id}`;

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
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                  <FavoriteToggle productId={product.id} userId={user?.id ?? null} />
                  <ShareButton title={product.title} url={shareUrl} className="h-8 w-8 rounded-full p-0" />
                </div>
                <ProductImages images={rawImages} title={product.title} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h1 dir="auto" className="text-2xl font-bold bidi-auto">{product.title}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-white ${getConditionColor(product.condition)}`}>
                      {product.condition ?? t('product.conditionUnknown')}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      {product.views} {t('product.viewsLabel')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-primary">
                    {formatPrice(product.price, product.currency)}
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
                      <>
                        <MapPin className="h-4 w-4" />
                        {product.location}
                      </>
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
                      <p className="text-sm text-muted-foreground leading-relaxed">
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
                        <AvatarFallback>{(seller?.fullName ?? seller?.email ?? 'U')[0]}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Link href={seller?.id ? `/seller/${seller.id}` : '#'} prefetch className="font-medium hover:underline">
                          {seller?.fullName ?? seller?.email ?? 'Seller'}
                        </Link>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-yellow-500">&#9733;</span>
                          <span className="text-sm">{seller?.rating ?? 'N/A'}</span>
                          <span className="text-sm text-muted-foreground">
                            ({seller?.totalRatings ?? 0} reviews)
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {seller?.location && (
                          <p>
                            {t('product.basedInPrefix')} {seller.location}
                          </p>
                        )}
                        {sellerJoinedLabel && (
                          <p>
                            {t('product.memberSincePrefix')} {sellerJoinedLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <ChatButton
                    sellerId={seller?.id ?? product.sellerId}
                    sellerName={seller?.fullName ?? seller?.email ?? 'Seller'}
                    productId={product.id}
                    productTitle={product.title}
                    viewerId={viewerId}
                  />
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

        <div className="mt-8">
          <ReviewSystem
            sellerId={seller?.id ?? product.sellerId}
            productId={product.id}
            averageRating={seller?.rating ?? 0}
            totalReviews={seller?.totalRatings ?? 0}
            canReview={Boolean(user && user.id !== seller?.id)}
            viewerId={user?.id ?? null}
          />
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
