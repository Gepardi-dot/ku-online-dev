'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import ProductCard from '@/components/product-card';
import { Button } from '@/components/ui/button';
import type { ProductWithRelations } from '@/lib/services/products';
import { useLocale } from '@/providers/locale-provider';

type RecommendedCarouselProps = {
  products: ProductWithRelations[];
  viewerId?: string | null;
};

const PAGE_SIZE = 4;

function buildPageItems(items: ProductWithRelations[], start: number): ProductWithRelations[] {
  if (items.length <= PAGE_SIZE) {
    return items.slice();
  }

  const page = items.slice(start, start + PAGE_SIZE);
  if (page.length === PAGE_SIZE) {
    return page;
  }

  return page.concat(items.slice(0, PAGE_SIZE - page.length));
}

export default function RecommendedCarousel({ products, viewerId }: RecommendedCarouselProps) {
  const { locale } = useLocale();
  const isRtl = locale === 'ar' || locale === 'ku';
  const [pageStart, setPageStart] = useState(0);

  const canPage = products.length > PAGE_SIZE;
  const desktopItems = useMemo(() => buildPageItems(products, pageStart), [products, pageStart]);

  const NextIcon = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div className="w-full">
      <div className="relative">
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="no-scrollbar -mx-2 grid grid-flow-col grid-rows-2 gap-3 overflow-x-auto px-2 pb-2 snap-x snap-proximity md:hidden"
          aria-label="Recommended products"
        >
          {products.map((product) => (
            <div key={product.id} className="w-[170px] shrink-0 snap-start">
              <ProductCard product={product} viewerId={viewerId} />
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {desktopItems.map((product) => (
              <ProductCard key={product.id} product={product} viewerId={viewerId} />
            ))}
          </div>

          {canPage ? (
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-full border border-[#eadbc5]/70 bg-white/80 shadow-sm hover:bg-white"
                onClick={() => setPageStart((prev) => (prev + PAGE_SIZE) % products.length)}
                aria-label="More recommendations"
              >
                <NextIcon className="h-4 w-4 text-brand" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
