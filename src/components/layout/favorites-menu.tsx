'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Heart, Loader2, Share2, Trash, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import BrandLogo from '@/components/brand-logo';

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
  const [topOffset, setTopOffset] = useState<number | null>(null);
  const [cardHeight, setCardHeight] = useState<number>(360);
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
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const announcement = document.querySelector<HTMLElement>('[data-announcement-bar]');
      const header = document.getElementById('ku-main-header');
      const mobileNav = document.querySelector<HTMLElement>('[data-mobile-nav]');

      let offsetTop = 16;

      if (announcement) {
        offsetTop += announcement.getBoundingClientRect().height;
      }
      if (header) {
        offsetTop += header.getBoundingClientRect().height;
      }

      const viewportHeight = window.innerHeight || 0;
      const navHeight = mobileNav ? mobileNav.getBoundingClientRect().height : 0;

      const extraGap = 24;
      let available = viewportHeight - offsetTop - navHeight - extraGap;

      if (!Number.isFinite(available) || available <= 0) {
        available = 360;
      }

      const clamped = Math.max(280, Math.min(380, available));

      setTopOffset(offsetTop);
      setCardHeight(clamped);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-[#E67E22] px-1 text-[10px] font-semibold text-white shadow-sm">
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

  const cardPaddingTop = Math.max(0, (topOffset ?? 120) + 8 - 24);
  const ebayTriggerClass =
    'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E4E4E4] bg-white text-[#1F1C1C] transition hover:border-[#E67E22] hover:text-[#E67E22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/50 focus-visible:ring-offset-2';

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {compactTrigger ? (
          <button
            type="button"
            className={`relative inline-flex items-center justify-center h-[var(--nav-icon-size)] w-[var(--nav-icon-size)] p-0 bg-transparent text-current ${triggerClassName ?? ''}`}
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
      </DialogTrigger>

      <DialogContent className="!top-0 !left-0 !h-screen !w-full !max-w-none !translate-x-0 !translate-y-0 !border-none !bg-transparent !p-0 !shadow-none flex items-start justify-center">
        <DialogTitle className="sr-only">{strings.label}</DialogTitle>
        <div
          className="relative flex min-h-[340px] w-full max-w-2xl items-start justify-center px-4 pb-6 sm:px-6"
          style={{ paddingTop: cardPaddingTop }}
        >
          {/* Soft glow behind card */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[60vh] w-[60vw] rounded-full bg-white/15 blur-3xl" />
          </div>

          {/* KU-ONLINE watermark logo */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <BrandLogo size={560} />
          </div>

          {/* Glass card */}
          {!canLoad ? (
            <div className="relative z-10 flex w-full max-w-xl items-center justify-center rounded-[32px] border border-white/60 bg-[rgba(255,250,245,0.35)] px-6 py-10 text-center text-sm text-[#777777] shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur">
              <DialogClose
                type="button"
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,250,245,0.95)] text-[#2D2D2D] shadow-[0_10px_30px_rgba(15,23,42,0.25)] transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label="Close favorites"
              >
                <X className="h-4 w-4" />
              </DialogClose>
              {strings.loginRequired}
            </div>
          ) : (
            <div
              className="relative z-10 mx-auto flex w-full max-w-xl flex-col rounded-[32px] border border-white/60 bg-[rgba(255,250,245,0.4)] p-4 sm:p-5 shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur"
              style={{ height: cardHeight }}
            >
              <DialogClose
                type="button"
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,250,245,0.95)] text-[#2D2D2D] shadow-[0_10px_30px_rgba(15,23,42,0.25)] transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label="Close favorites"
              >
                <X className="h-4 w-4" />
              </DialogClose>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#2D2D2D]">{strings.label}</p>
                  <p className="text-xs text-[#777777]">
                    {favorites.length > 0
                      ? `${favorites.length} ${favorites.length === 1 ? 'listing' : 'listings'} saved`
                      : strings.empty}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : favorites.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {strings.empty}
                  </div>
                ) : (
                  <ScrollArea className="h-full rounded-[24px] border border-white/60 bg-[rgba(255,255,255,0.85)]">
                    <div className="divide-y">
                      {favorites.map((favorite) => {
                        const product = favorite.product;
                        const firstUrl = (product?.imageUrls ?? []).find(
                          (u) => typeof u === 'string' && u.trim().length > 0,
                        );
                        const imageSrc: string | undefined =
                          firstUrl && firstUrl.trim().length > 0 ? firstUrl : undefined;
                        return (
                          <div key={favorite.id} className="flex items-center gap-3 p-3">
                            <Link
                              href={product ? `/product/${product.id}` : '#'}
                              className="relative h-20 w-20 overflow-hidden rounded-xl"
                            >
                              {imageSrc ? (
                                <Image
                                  src={imageSrc}
                                  alt={product?.title ?? 'Product'}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                                  No image
                                </div>
                              )}
                            </Link>
                            <div className="flex-1 space-y-1">
                              <Link
                                href={product ? `/product/${product.id}` : '#'}
                                className="text-sm font-semibold text-[#2D2D2D] hover:underline"
                              >
                                {product?.title ?? 'Listing removed'}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {formatPrice(product?.price ?? null, product?.currency ?? null)}
                              </p>
                              {product?.location && (
                                <p className="text-xs text-muted-foreground">{product.location}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-[#E67E22] hover:text-[#c8651d]"
                                onClick={() => void handleShare(favorite)}
                                disabled={!product}
                                aria-label="Share listing"
                              >
                                <Share2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => void handleRemove(favorite)}
                                aria-label="Remove from favorites"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
