'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
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

  useEffect(() => {
    setLocalSold(isSold);
  }, [isSold]);

  const handleToggle = useCallback(async () => {
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
    <div className="space-y-3">
      {localSold ? (
        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-700">
          {t('product.soldBadge')}
        </div>
      ) : null}
      <Button
        type="button"
        onClick={handleToggle}
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
    </div>
  );
}
