
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProductCard from '@/components/product-card';
import { getSimilarProducts } from '@/lib/services/products';

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

  const similarProducts = await getSimilarProducts(productId, categoryId, location, 6);

  if (similarProducts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Recommended for You</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Recommended products"
        >
          {similarProducts.map((recProduct) => (
            <div key={recProduct.id} className="snap-start shrink-0 w-[240px] sm:w-[260px] md:w-[280px]">
              <ProductCard product={recProduct} viewerId={viewerId} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
