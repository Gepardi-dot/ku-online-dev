'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

type BuyerOption = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
};

interface MarkSoldToggleProps {
  productId: string;
  sellerId: string;
  viewerId: string | null;
  isSold: boolean;
  buyers?: BuyerOption[];
  soldBuyerId?: string | null;
}

export default function MarkSoldToggle({
  productId,
  sellerId,
  viewerId,
  isSold,
  buyers = [],
  soldBuyerId = null,
}: MarkSoldToggleProps) {
  const [loading, setLoading] = useState(false);
  const [localSold, setLocalSold] = useState(isSold);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(soldBuyerId);
  const router = useRouter();
  const { t } = useLocale();

  const canToggle = Boolean(viewerId && viewerId === sellerId);
  const requiresBuyer = !localSold && buyers.length > 0;
  const soldBuyer = useMemo(
    () => buyers.find((buyer) => buyer.id === soldBuyerId) ?? null,
    [buyers, soldBuyerId],
  );

  useEffect(() => {
    setLocalSold(isSold);
  }, [isSold]);

  useEffect(() => {
    setSelectedBuyerId(soldBuyerId);
  }, [soldBuyerId]);

  const handleClick = useCallback(async () => {
    if (!canToggle) {
      toast({ title: t('product.toggleSoldNotAllowed') });
      return;
    }
    if (loading) return;
    if (requiresBuyer && !selectedBuyerId) {
      toast({ title: t('product.selectBuyerRequired') });
      return;
    }
    setLoading(true);
    try {
      const next = !localSold;
      const body: { isSold: boolean; buyerId?: string } = { isSold: next };
      if (next && selectedBuyerId) {
        body.buyerId = selectedBuyerId;
      }

      const response = await fetch(`/api/products/${productId}/sold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
  }, [canToggle, loading, localSold, productId, requiresBuyer, router, selectedBuyerId, t]);

  return (
    <div className="space-y-3">
      {canToggle && !localSold ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('product.buyerLabel')}
          </p>
          {buyers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('product.buyerEmpty')}</p>
          ) : (
            <Select value={selectedBuyerId ?? undefined} onValueChange={setSelectedBuyerId}>
              <SelectTrigger className="rounded-xl border-[#eadbc5]/70 bg-white/70">
                <SelectValue placeholder={t('product.buyerPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {buyers.map((buyer) => (
                  <SelectItem key={buyer.id} value={buyer.id}>
                    {buyer.fullName ?? t('product.buyerFallback')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : null}
      {canToggle && localSold ? (
        <div className="text-xs text-muted-foreground">
          {t('product.buyerLabel')}: {soldBuyer?.fullName ?? t('product.buyerUnknown')}
        </div>
      ) : null}
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
    </div>
  );
}
