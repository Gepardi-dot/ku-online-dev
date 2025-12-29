'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Heart, Loader2, Share2, Trash, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  compactTrigger?: boolean;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
}

export default function FavoritesMenu({
  userId,
  strings,
  compactTrigger = false,
  triggerClassName,
  triggerIcon,
}: FavoritesMenuProps) {
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const recentMutationsRef = useRef(new Set<string>());

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
      const [items, total] = await Promise.all([listFavorites(userId, 30), countFavorites(userId)]);
      setFavorites(items);
      setCount(total);
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
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = subscribeToFavorites(userId, ({ type, favoriteId }) => {
      if (favoriteId && recentMutationsRef.current.has(favoriteId)) {
        recentMutationsRef.current.delete(favoriteId);
      } else {
        setCount((prev) => {
          const delta = type === 'INSERT' ? 1 : type === 'DELETE' ? -1 : 0;
          return Math.max(0, prev + delta);
        });
      }

      if (open) {
        void loadFavorites();
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, open, loadFavorites]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ delta?: number; mutatedFavoriteId?: string | null }>;
      const delta = customEvent.detail?.delta;
      if (typeof delta === 'number') {
        setCount((prev) => Math.max(0, prev + delta));
      }
      const mutationId = customEvent.detail?.mutatedFavoriteId;
      if (mutationId) {
        recentMutationsRef.current.add(mutationId);
        setTimeout(() => {
          recentMutationsRef.current.delete(mutationId);
        }, 2000);
      }
      if (open) {
        void loadFavorites();
      }
    };

    window.addEventListener(favoritesEvents.eventName, handler);
    return () => {
      window.removeEventListener(favoritesEvents.eventName, handler);
    };
  }, [loadFavorites, open]);

  useEffect(() => {
    if (!open && favorites.length) {
      setFavorites([]);
    }
  }, [open, favorites.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== 'favorites-menu') {
        setOpen(false);
      }
    };
    window.addEventListener('ku-menu-open', handler);
    return () => window.removeEventListener('ku-menu-open', handler);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({
            title: strings.loginRequired,
            variant: 'brand',
          });
          return;
        }
        setOpen(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ku-menu-open', { detail: { source: 'favorites-menu' } }));
        }
        void loadFavorites();
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
        setCount((prev) => Math.max(0, prev - 1));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(favoritesEvents.eventName, {
              detail: {
                productId: favorite.productId,
                isFavorited: false,
                favoriteId: null,
                delta: -1,
                mutatedFavoriteId: favorite.id,
              },
            }),
          );
        }
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
      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-brand px-1 text-[10px] font-semibold text-white shadow-sm">
        {display}
      </span>
    );
  }, [count]);

  const formatPrice = useCallback((price: number | null, currency: string | null) => {
    if (price === null) {
      return '�?"';
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

  const ebayTriggerClass =
    'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6d6d6]/80 bg-gradient-to-b from-[#fbfbfb] to-[#f1f1f1] text-[#1F1C1C] shadow-sm transition hover:border-brand/50 hover:text-brand hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40 active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:border-brand/60 data-[state=open]:bg-white/90 data-[state=open]:shadow-[0_16px_38px_rgba(247,111,29,0.18)]';

  const handleShare = useCallback(async (favorite: FavoriteSummary) => {
    const product = favorite.product;
    if (!product) return;

    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/product/${product.id}`
        : `/product/${product.id}`;

    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({
          title: product.title,
          text: product.title,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copied', description: 'Share this listing with your friends.' });
    } catch (error) {
      console.error('Failed to share favorite', error);
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: 'Link copied', description: 'Share this listing with your friends.' });
      } catch {
        toast({
          title: 'Unable to share',
          description: 'Please copy the link manually.',
          variant: 'destructive',
        });
      }
    }
  }, []);

  const handleNavigate = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={true}>
      <PopoverTrigger asChild>
        {compactTrigger ? (
          <button
            type="button"
            className={`relative inline-flex items-center justify-center h-[var(--nav-icon-size)] w-[var(--nav-icon-size)] p-0 bg-transparent text-current transition active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:text-brand ${triggerClassName ?? ''}`}
            aria-label={strings.label}
          >
            {triggerIcon ? (
              <span className="inline-flex items-center justify-center h-full w-full">{triggerIcon}</span>
            ) : (
              <Heart className="h-full w-full" strokeWidth={1.6} />
            )}
            {indicator}
          </button>
        ) : (
          <button
            type="button"
            className={`${ebayTriggerClass} ${triggerClassName ?? ''}`}
            aria-label={strings.label}
          >
            {triggerIcon ? (
              <span className="inline-flex items-center justify-center">{triggerIcon}</span>
            ) : (
              <Heart className="h-6 w-6" strokeWidth={1.5} />
            )}
            {indicator}
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={12}
        className="z-[90] flex w-[420px] max-h-[calc(100vh-5rem)] max-w-[calc(100vw-1rem)] flex-col overscroll-contain rounded-[32px] border border-white/60 bg-gradient-to-br from-white/30 via-white/20 to-white/5 !bg-transparent p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40"
      >
        {!canLoad ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {strings.loginRequired}
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between px-3 py-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-brand">{strings.label}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#eadbc5]/70 bg-white/80 text-[#2D2D2D] shadow-sm transition hover:bg-white hover:text-brand hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                aria-label="Close favorites"
              >
                <X className="h-4 w-4" />
              </button>
            </div>


              {loading ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : favorites.length === 0 ? (
                <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {strings.empty}
                </div>
              ) : (
                <div className="max-h-[360px] overflow-y-auto w-full pr-3 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-brand [&::-webkit-scrollbar-thumb]:to-brand-light [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:from-brand-dark hover:[&::-webkit-scrollbar-thumb]:to-brand">
                  <div className="space-y-3 p-0.5">
                    {favorites.map((favorite) => {
                      const product = favorite.product;
                      const firstUrl = (product?.imageUrls ?? []).find(
                        (u) => typeof u === 'string' && u.trim().length > 0,
                      );
                      const imageSrc: string | undefined =
                        firstUrl && firstUrl.trim().length > 0 ? firstUrl : undefined;

                      return (
                        <div
                          key={favorite.id}
                          className="relative flex w-full items-start gap-3 rounded-3xl border border-[#eadbc5]/70 bg-white/50 p-3 shadow-sm ring-1 ring-black/[0.05] transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[#eadbc5]"
                        >
                          <Link
                            href={product ? `/product/${product.id}` : '#'}
                            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/60 bg-white/80"
                            onClick={handleNavigate}
                          >
                            {imageSrc ? (
                              <Image src={imageSrc} alt={product?.title ?? 'Product'} fill className="object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted/20 text-xs font-bold text-muted-foreground">
                                No image
                              </div>
                            )}
                          </Link>
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                              <Link
                                href={product ? `/product/${product.id}` : '#'}
                                className="truncate text-sm font-bold text-[#2D2D2D] hover:underline"
                                onClick={handleNavigate}
                              >
                                {product?.title ?? 'Listing removed'}
                              </Link>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between">
                              <p className="truncate text-sm font-bold text-brand">
                                {formatPrice(product?.price ?? null, product?.currency ?? null)}
                              </p>
                            </div>
                            {product?.location && (
                              <p className="mt-0.5 truncate text-sm font-medium text-[#777777]">{product.location}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full border border-[#eadbc5]/70 bg-white text-brand shadow-sm hover:border-brand/40 hover:bg-white"
                              onClick={() => void handleShare(favorite)}
                              disabled={!product}
                              aria-label="Share listing"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full border border-[#eadbc5]/70 bg-white text-destructive shadow-sm hover:border-destructive/30 hover:bg-white"
                              onClick={() => void handleRemove(favorite)}
                              aria-label="Remove from favorites"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
