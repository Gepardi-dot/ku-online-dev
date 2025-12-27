
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSimilarProducts } from '@/lib/services/products';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import RecommendedCarousel from '@/components/product/RecommendedCarousel';

interface SimilarItemsProps {
  productId: string;
  categoryId: string | null | undefined;
  location?: string | null;
  viewerId?: string | null;
}

export default async function SimilarItems({ productId, categoryId, location, viewerId }: SimilarItemsProps) {
  if (!categoryId) {
    return null;
  }

  const [locale, similarProducts] = await Promise.all([
    getServerLocale(),
    getSimilarProducts(productId, categoryId, location, 12),
  ]);

  if (similarProducts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle dir="auto" className="font-headline text-2xl bidi-auto">
          {serverTranslate(locale, 'product.recommendedForYou')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RecommendedCarousel products={similarProducts} viewerId={viewerId} />
      </CardContent>
    </Card>
  );
}
