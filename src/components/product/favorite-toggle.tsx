'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addFavorite, fetchFavoriteStatus, removeFavorite } from '@/lib/services/favorites-client';

type FavoriteToggleVariant = 'icon' | 'pill';

type FavoriteToggleSize = 'sm' | 'default';

interface FavoriteToggleProps {
  productId: string;
  userId?: string | null;
  onChange?: (isFavorited: boolean) => void;
  variant?: FavoriteToggleVariant;
  size?: FavoriteToggleSize;
  className?: string;
}

const FAVORITES_EVENT = 'favorites:updated';

export default function FavoriteToggle({
  productId,
  userId,
  onChange,
  variant = 'icon',
  size = 'default',
  className,
}: FavoriteToggleProps) {
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const canUseFavorites = Boolean(userId);

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      if (!userId) {
        setInitialized(true);
        setIsFavorited(false);
        setFavoriteId(null);
        return;
      }

      try {
        const { favoriteId: existingId, isFavorited: existingStatus } = await fetchFavoriteStatus(userId, productId);
        if (!active) return;
        setFavoriteId(existingId);
        setIsFavorited(existingStatus);
      } catch (error) {
        console.error('Failed to load favorite status', error);
      } finally {
        if (active) {
          setInitialized(true);
        }
      }
    }

    loadStatus();

    return () => {
      active = false;
    };
  }, [productId, userId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        productId: string;
        isFavorited?: boolean;
        favoriteId?: string | null;
      }>;

      const detail = customEvent.detail;
      if (!detail || detail.productId !== productId) {
        return;
      }

      if (typeof detail.isFavorited === 'boolean') {
        setIsFavorited(detail.isFavorited);
        if (detail.isFavorited && detail.favoriteId) {
          setFavoriteId(detail.favoriteId);
        }
        if (!detail.isFavorited) {
          setFavoriteId(null);
        }
      }
    };

    window.addEventListener(FAVORITES_EVENT, handler);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, handler);
    };
  }, [productId]);

  const dispatchFavoritesEvent = useCallback(
    (nowFavorited: boolean, nextFavoriteId: string | null) => {
      if (typeof window === 'undefined' || !userId) {
        return;
      }

      const detail = {
        productId,
        isFavorited: nowFavorited,
        favoriteId: nextFavoriteId,
        delta: nowFavorited ? 1 : -1,
        mutatedFavoriteId: nextFavoriteId ?? favoriteId,
      } as const;

      window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail }));
    },
    [favoriteId, productId, userId],
  );

  const handleToggle = useCallback(async () => {
    if (!canUseFavorites) {
      toast({
        title: 'Sign in required',
        description: 'Create an account or sign in to save items to your favorites.',
      });
      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);

    try {
      if (isFavorited && favoriteId) {
        await removeFavorite(favoriteId, userId!);
        setIsFavorited(false);
        setFavoriteId(null);
        onChange?.(false);
        dispatchFavoritesEvent(false, null);
      } else {
        const newId = await addFavorite(userId!, productId);
        setIsFavorited(true);
        setFavoriteId(newId);
        onChange?.(true);
        dispatchFavoritesEvent(true, newId);
      }
    } catch (error) {
      console.error('Failed to toggle favorite', error);
      toast({
        title: 'Could not update favorite',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [canUseFavorites, favoriteId, isFavorited, loading, onChange, productId, userId, dispatchFavoritesEvent]);

  const buttonClasses = useMemo(() => {
    if (variant === 'pill') {
      return cn(
        'flex items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isFavorited
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-white text-muted-foreground hover:text-foreground hover:border-primary/50',
        className,
      );
    }

    return cn(
      'h-8 w-8 rounded-full border border-transparent bg-white/80 p-0 shadow-sm transition hover:border-primary/30 hover:text-primary',
      isFavorited ? 'text-primary' : 'text-muted-foreground',
      className,
    );
  }, [className, isFavorited, variant]);

  const iconSize = size === 'sm' ? 16 : 18;

  return (
    <Button
      type="button"
      variant={variant === 'pill' ? 'ghost' : 'secondary'}
      className={buttonClasses}
      onClick={handleToggle}
      disabled={loading || !initialized}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={cn('transition', isFavorited ? 'fill-current' : 'fill-transparent')} size={iconSize} />
      )}
      {variant === 'pill' && <span>{isFavorited ? 'Saved' : 'Save'}</span>}
    </Button>
  );
}

export const favoritesEvents = {
  eventName: FAVORITES_EVENT,
};
