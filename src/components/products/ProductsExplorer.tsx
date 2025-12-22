'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ProductCard from '@/components/product-card-new';
import type { ProductWithRelations } from '@/lib/services/products';
import type { ProductsFilterValues } from '@/lib/products/filter-params';
import { createProductsSearchParams } from '@/lib/products/filter-params';

interface ProductsExplorerProps {
  initialItems: ProductWithRelations[];
  initialPage: number;
  totalCount: number;
  pageSize: number;
  filterValues: ProductsFilterValues;
  viewerId?: string | null;
}

export function ProductsExplorer({
  initialItems,
  initialPage,
  totalCount,
  pageSize,
  filterValues,
  viewerId,
}: ProductsExplorerProps) {
  const [items, setItems] = useState<ProductWithRelations[]>(initialItems);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(totalCount);
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setPage(initialPage);
    setTotal(totalCount);
  }, [initialItems, initialPage, totalCount]);

  const hasMore = useMemo(() => items.length < total, [items.length, total]);

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);

    const nextPage = page + 1;
    try {
      const params = createProductsSearchParams(filterValues, { page: nextPage.toString() });
      const query = params.toString();
      const response = await fetch(`/api/products/search${query ? `?${query}` : ''}`);
      if (!response.ok) {
        throw new Error('Failed to load more products');
      }
      const payload = await response.json();
      const incoming: ProductWithRelations[] = Array.isArray(payload.items) ? payload.items : [];

      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const merged = [...prev];
        for (const product of incoming) {
          if (product?.id && !seen.has(product.id)) {
            merged.push(product);
          }
        }
        return merged;
      });
      setPage(nextPage);
      setTotal(typeof payload.count === 'number' ? payload.count : totalCount);
    } catch (error) {
      console.error('Unable to load more products', error);
    } finally {
      setLoadingMore(false);
    }
  }, [filterValues, hasMore, loadingMore, page, totalCount]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        fetchMore();
      }
    }, {
      rootMargin: '200px',
      threshold: 0.1,
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [fetchMore, hasMore]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} viewerId={viewerId} searchQuery={filterValues.search} />
        ))}
        {loadingMore &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="rounded-lg border bg-card p-2 animate-pulse">
              <div className="aspect-square w-full rounded-md bg-muted" />
              <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
      </div>

      <div ref={sentinelRef} />

      {!hasMore && !loadingMore && items.length >= pageSize && (
        <p className="text-center text-sm text-muted-foreground">You have reached the end of the results.</p>
      )}
    </div>
  );
}
