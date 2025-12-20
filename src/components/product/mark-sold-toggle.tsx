'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

interface MarkSoldToggleProps {
  productId: string;
  sellerId: string;
  viewerId: string | null;
  isSold: boolean;
}

export default function MarkSoldToggle({ productId, sellerId, viewerId, isSold }: MarkSoldToggleProps) {
  const [loading, setLoading] = useState(false);
  const [localSold, setLocalSold] = useState(isSold);
  const router = useRouter();
  const { t } = useLocale();

  const canToggle = Boolean(viewerId && viewerId === sellerId);

  const handleClick = useCallback(async () => {
    if (!canToggle) {
      toast({ title: t('product.toggleSoldNotAllowed') });
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const next = !localSold;

      const response = await fetch(`/api/products/${productId}/sold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSold: next }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Request failed';
        throw new Error(message);
      }

      setLocalSold(Boolean(payload?.isSold ?? next));
      toast({ title: next ? t('product.markedSold') : t('product.markedAvailable') });
      router.refresh();
    } catch (err) {
      console.error('Failed to toggle sold status', err);
      toast({
        title: t('product.toggleSoldFailed'),
        description: t('product.toggleSoldFailedHint'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [canToggle, loading, localSold, productId, router, t]);

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={!canToggle || loading}
      variant={localSold ? 'outline' : 'default'}
      className="w-full"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : localSold ? (
        <RotateCcw className="mr-2 h-4 w-4" />
      ) : (
        <CheckCircle2 className="mr-2 h-4 w-4" />
      )}
      {localSold ? t('product.markAsAvailable') : t('product.markAsSold')}
    </Button>
  );
}
