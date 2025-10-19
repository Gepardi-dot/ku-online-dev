
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
import { MapPin, Eye, Share2, Flag } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChatButton from '@/components/chat/chat-button';
import ReviewSystem from '@/components/reviews/review-system';
import SimilarItems from '@/components/product/similar-items';
import { formatDistanceToNow } from 'date-fns';
import { getProductById, incrementProductViews } from '@/lib/services/products';
import FavoriteToggle from '@/components/product/favorite-toggle';

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

  const images = product.images.length > 0 ? product.images : ['https://placehold.co/800x600?text=KU-ONLINE'];
  const seller = product.seller;
  const createdAtLabel = product.createdAt ? formatDistanceToNow(product.createdAt, { addSuffix: true }) : '';
  const sellerJoinedLabel = seller?.createdAt ? formatDistanceToNow(seller.createdAt, { addSuffix: true }) : null;

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div className="relative aspect-[4/3] rounded-lg overflow-hidden">
                <Image
                  src={images[0]}
                  alt={product.title}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute top-4 right-4 flex gap-2">
                  <FavoriteToggle productId={product.id} userId={user?.id ?? null} />
                  <Button size="sm" variant="secondary" className="h-8 w-8 rounded-full p-0">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {images.length > 1 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.slice(1).map((image, index) => (
                    <div key={image + index} className="relative aspect-[4/3] rounded-lg overflow-hidden">
                      <Image src={image} alt={`${product.title} ${index + 2}`} fill className="object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h1 className="text-2xl font-bold">{product.title}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-white ${getConditionColor(product.condition)}`}>
                      {product.condition ?? 'Unknown'}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      {product.views} views
                    </div>
                  </div>
                </div>

                <div className="text-3xl font-bold text-primary">
                  {formatPrice(product.price, product.currency)}
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
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {product.description}
                      </p>
                    </div>
                  </>
                )}

                <Separator />

                <div>
                  <h3 className="font-semibold mb-3">Seller Information</h3>
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={seller?.avatar ?? undefined} />
                      <AvatarFallback>{(seller?.fullName ?? seller?.email ?? 'U')[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{seller?.fullName ?? seller?.email ?? 'Seller'}</h4>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-yellow-500">&#9733;</span>
                          <span className="text-sm">{seller?.rating ?? 'N/A'}</span>
                          <span className="text-sm text-muted-foreground">
                            ({seller?.totalRatings ?? 0} reviews)
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {seller?.location && <p>Based in {seller.location}</p>}
                        {sellerJoinedLabel && <p>Member since {sellerJoinedLabel}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <ChatButton
                    sellerId={seller?.id ?? ''}
                    sellerName={seller?.fullName ?? seller?.email ?? 'Seller'}
                    productId={product.id}
                    productTitle={product.title}
                    viewerId={user?.id ?? null}
                    viewerName={user?.user_metadata?.full_name ?? user?.email ?? undefined}
                  />
                  <Button variant="outline" className="w-full">
                    <Flag className="mr-2 h-4 w-4" />
                    Report Listing
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8">
          <ReviewSystem
            sellerId={seller?.id ?? ''}
            productId={product.id}
            averageRating={seller?.rating ?? 0}
            totalReviews={seller?.totalRatings ?? 0}
            reviews={placeholderReviews}
            canReview={Boolean(user && user.id !== seller?.id)}
          />
        </div>

        <Suspense
          fallback={(
            <div className="mt-8">
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  Loading similar items...
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
