
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import ProductCard from '@/components/product-card';
import { getSimilarProducts } from '@/lib/services/products';

interface SimilarItemsProps {
  productId: string;
  categoryId: string | null | undefined;
  viewerId?: string | null;
}

export default async function SimilarItems({ productId, categoryId, viewerId }: SimilarItemsProps) {
  if (!categoryId) {
    return null;
  }

  const similarProducts = await getSimilarProducts(productId, categoryId, 6);

  if (similarProducts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-2xl">You Might Also Like</CardTitle>
      </CardHeader>
      <CardContent>
        <Carousel
          opts={{
            align: 'start',
            loop: similarProducts.length > 3,
          }}
          className="w-full"
        >
          <CarouselContent>
            {similarProducts.map((recProduct) => (
              <CarouselItem key={recProduct.id} className="md:basis-1/2 lg:basis-1/3">
                <div className="p-1 h-full">
                  <ProductCard product={recProduct} viewerId={viewerId} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden sm:flex" />
          <CarouselNext className="hidden sm:flex" />
        </Carousel>
      </CardContent>
    </Card>
  );
}
