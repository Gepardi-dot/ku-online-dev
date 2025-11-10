'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { createClient } from '@/utils/supabase/client';

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
  const supabase = createClient();

  const canToggle = Boolean(viewerId && viewerId === sellerId);

  const handleClick = useCallback(async () => {
    if (!canToggle) {
      toast({ title: 'Only the seller can update this listing.' });
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const next = !localSold;
      const { error } = await supabase
        .from('products')
        .update({ is_sold: next })
        .eq('id', productId)
        .eq('seller_id', sellerId);
      if (error) throw error;
      setLocalSold(next);
      toast({ title: next ? 'Marked as sold' : 'Marked as available' });
      router.refresh();
    } catch (err) {
      console.error('Failed to toggle sold status', err);
      toast({ title: 'Failed to update', description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [canToggle, loading, localSold, productId, router, sellerId, supabase]);

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
      {localSold ? 'Mark as Available' : 'Mark as Sold'}
    </Button>
  );
}

