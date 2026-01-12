'use client';

import { useState, type MouseEvent } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ProductFavoriteButtonProps {
  productId: string;
  initialFavorite?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  className?: string;
  preventLinkNavigation?: boolean;
  onToggle?: (isFavorite: boolean) => void;
}

export default function ProductFavoriteButton({
  productId,
  initialFavorite = false,
  size = 'default',
  variant = 'secondary',
  className,
  preventLinkNavigation = true,
  onToggle,
}: ProductFavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState<boolean>(initialFavorite);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    if (preventLinkNavigation) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (isSubmitting) {
      return;
    }

    const next = !isFavorite;
    setIsFavorite(next);
    onToggle?.(next);

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/favorites', {
        method: next ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast({
            title: 'Sign in required',
            description: 'Create an account or sign in to save items to your watchlist.',
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Unable to update watchlist',
            description: 'Please try again in a moment.',
          });
        }
        throw new Error('Favorite request failed');
      }

      toast({
        title: next ? 'Added to watchlist' : 'Removed from watchlist',
        description: next ? 'You can find this item in your watchlist.' : 'This item was removed from your watchlist.',
      });
    } catch (error) {
      console.error('Failed to toggle favorite', error);
      setIsFavorite(!next);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn('p-0 transition-colors', className, isFavorite && 'text-red-500')}
      disabled={isSubmitting}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={handleClick}
    >
      <Heart
        className="h-4 w-4"
        fill={isFavorite ? 'currentColor' : 'none'}
      />
    </Button>
  );
}
