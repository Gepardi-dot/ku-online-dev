'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, Loader2, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import Link from 'next/link';
import {
  countFavorites,
  listFavorites,
  removeFavorite,
  subscribeToFavorites,
  type FavoriteSummary,
} from '@/lib/services/favorites-client';
import { favoritesEvents } from '@/components/product/favorite-toggle';
import { toast } from '@/hooks/use-toast';

interface FavoritesMenuStrings {
  label: string;
  empty: string;
  loginRequired: string;
}

interface FavoritesMenuProps {
  userId?: string | null;
  strings: FavoritesMenuStrings;
}

export default function FavoritesMenu({ userId, strings }: FavoritesMenuProps) {
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const canLoad = Boolean(userId);

  const refreshCount = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    try {
      const total = await countFavorites(userId);
      setCount(total);
    } catch (error) {
      console.error('Failed to count favorites', error);
    }
  }, [userId]);

  const loadFavorites = useCallback(async () => {
    if (!userId) {
      setFavorites([]);
      return;
    }
    setLoading(true);
    try {
      const items = await listFavorites(userId, 30);
      setFavorites(items);
    } catch (error) {
      console.error('Failed to load favorites', error);
      toast({
        title: 'Unable to load favorites',
        description: 'Please try again soon.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = subscribeToFavorites(userId, () => {
      refreshCount();
      if (open) {
        loadFavorites();
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, refreshCount, open, loadFavorites]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ totalFavorites?: number }>;
      if (typeof customEvent.detail?.totalFavorites === 'number') {
        setCount(customEvent.detail.totalFavorites);
      }
      if (open) {
        loadFavorites();
      }
    };

    window.addEventListener(favoritesEvents.eventName, handler);
    return () => {
      window.removeEventListener(favoritesEvents.eventName, handler);
    };
  }, [loadFavorites, open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({
            title: strings.loginRequired,
          });
          return;
        }
        setOpen(true);
        loadFavorites();
      } else {
        setOpen(false);
      }
    },
    [canLoad, loadFavorites, strings.loginRequired],
  );

  const handleRemove = useCallback(
    async (favorite: FavoriteSummary) => {
      if (!userId) {
        return;
      }
      try {
        await removeFavorite(favorite.id, userId);
        setFavorites((prev) => prev.filter((item) => item.id !== favorite.id));
        setCount((prev) => {
          const next = Math.max(0, prev - 1);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(favoritesEvents.eventName, {
                detail: {
                  productId: favorite.productId,
                  isFavorited: false,
                  totalFavorites: next,
                  favoriteId: null,
                },
              }),
            );
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to remove favorite', error);
        toast({
          title: 'Could not remove favorite',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [userId],
  );

  const indicator = useMemo(() => {
    if (!count) {
      return null;
    }
    const display = count > 9 ? '9+' : String(count);
    return (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
        {display}
      </span>
    );
  }, [count]);

  const formatPrice = useCallback((price: number | null, currency: string | null) => {
    if (price === null) {
      return '—';
    }
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency ?? 'IQD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(price)
        .replace('IQD', 'IQD');
    } catch {
      return `${price} ${currency ?? 'IQD'}`;
    }
  }, []);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label={strings.label}>
          <Heart className="h-4 w-4" />
          {indicator}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{strings.label}</SheetTitle>
        </SheetHeader>
        {!canLoad ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {strings.loginRequired}
          </div>
        ) : (
          <ScrollArea className="mt-4 h-[360px] rounded-lg border">
            {loading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : favorites.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {strings.empty}
              </div>
            ) : (
              <div className="divide-y">
                {favorites.map((favorite) => {
                  const product = favorite.product;
                  const imageSrc = product?.images?.[0] ?? 'https://placehold.co/96x96?text=KU';
                  return (
                    <div key={favorite.id} className="flex items-center gap-3 p-3">
                      <Link href={product ? `/product/${product.id}` : '#'} className="relative h-20 w-20 overflow-hidden rounded-lg">
                        <Image src={imageSrc} alt={product?.title ?? 'Product'} fill className="object-cover" />
                      </Link>
                      <div className="flex-1 space-y-1">
                        <Link
                          href={product ? `/product/${product.id}` : '#'}
                          className="text-sm font-semibold hover:underline"
                        >
                          {product?.title ?? 'Listing removed'}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(product?.price ?? null, product?.currency ?? null)}
                        </p>
                        {product?.location && <p className="text-xs text-muted-foreground">{product.location}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleRemove(favorite)}
                        aria-label="Remove from favorites"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
