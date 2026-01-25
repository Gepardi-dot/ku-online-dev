'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

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
  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<ProductWithRelations[]>(initialItems);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(totalCount);
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

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
    if (hydrated) {
      return;
    }
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
  }, [fetchMore, hasMore, hydrated]);

  return (
    <div className="space-y-6">
      {hydrated ? (
        <VirtualizedProductsGrid
          items={items}
          viewerId={viewerId}
          searchQuery={filterValues.search}
          loadingMore={loadingMore}
          hasMore={hasMore}
          loadMore={fetchMore}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} viewerId={viewerId} searchQuery={filterValues.search} />
            ))}
            {loadingMore &&
              Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={`skeleton-${i}`} />
              ))}
          </div>

          <div ref={sentinelRef} />
        </>
      )}

      {!hasMore && !loadingMore && items.length >= pageSize && (
        <p className="text-center text-sm text-muted-foreground">You have reached the end of the results.</p>
      )}
    </div>
  );
}

function getColumnsForViewport(viewportWidth: number) {
  if (viewportWidth >= 1280) return 6;
  if (viewportWidth >= 1024) return 5;
  if (viewportWidth >= 768) return 4;
  if (viewportWidth >= 640) return 3;
  return 2;
}

interface VirtualizedProductsGridProps {
  items: ProductWithRelations[];
  viewerId?: string | null;
  searchQuery?: string | null;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

function VirtualizedProductsGrid({
  items,
  viewerId,
  searchQuery,
  loadingMore,
  hasMore,
  loadMore,
}: VirtualizedProductsGridProps) {
  const [columns, setColumns] = useState(() => (typeof window === 'undefined' ? 2 : getColumnsForViewport(window.innerWidth)));

  useEffect(() => {
    let rafId = 0;

    const update = () => {
      setColumns(getColumnsForViewport(window.innerWidth));
    };

    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const skeletonCount = loadingMore ? columns * 2 : 0;
  const renderCount = items.length + skeletonCount;
  const rowCount = Math.max(1, Math.ceil(renderCount / columns));

  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 420,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRowIndex = virtualRows[virtualRows.length - 1]?.index ?? 0;

  useEffect(() => {
    if (!hasMore || loadingMore) {
      return;
    }

    if (lastVirtualRowIndex >= rowCount - 2) {
      loadMore();
    }
  }, [hasMore, lastVirtualRowIndex, loadMore, loadingMore, rowCount]);

  return (
    <div
      style={{
        height: rowVirtualizer.getTotalSize(),
        position: 'relative',
        width: '100%',
      }}
    >
      {virtualRows.map((virtualRow) => {
        const startIndex = virtualRow.index * columns;
        const rowItems = [];

        for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
          const itemIndex = startIndex + columnIndex;
          if (itemIndex >= renderCount) {
            break;
          }

          if (itemIndex < items.length) {
            const product = items[itemIndex];
            rowItems.push(
              <ProductCard key={product.id} product={product} viewerId={viewerId} searchQuery={searchQuery} />,
            );
            continue;
          }

          rowItems.push(<ProductCardSkeleton key={`skeleton-${itemIndex}`} />);
        }

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className="pb-3"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {rowItems}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border bg-card overflow-hidden">
      <div className="w-full h-[clamp(160px,45vw,230px)] md:h-auto md:aspect-4/3 bg-muted" />
      <div className="h-[146px] px-3 py-3 space-y-3">
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-6 w-1/2 rounded bg-muted" />
        <div className="flex items-center justify-between gap-2">
          <div className="h-6 w-1/2 rounded-full bg-muted" />
          <div className="h-6 w-1/4 rounded-full bg-muted" />
        </div>
        <div className="h-6 w-3/4 rounded-full bg-muted" />
      </div>
    </div>
  );
}
