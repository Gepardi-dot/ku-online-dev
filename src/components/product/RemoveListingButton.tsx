'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';

import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type RemoveListingButtonProps = {
  productId: string;
  redirectTo?: string;
  onDeleted?: () => void;
  size?: ButtonProps['size'];
  className?: string;
};

export default function RemoveListingButton({
  productId,
  redirectTo,
  onDeleted,
  size = 'default',
  className,
}: RemoveListingButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLocale();

  const removeListing = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.ok !== true) {
        const message = typeof payload?.error === 'string' ? payload.error : t('product.removeListingFailed');
        throw new Error(message);
      }

      const warning =
        typeof payload?.storageWarning === 'string' && payload.storageWarning.trim().length > 0
          ? payload.storageWarning.trim()
          : null;

      toast({ title: t('product.removeListingSuccess'), description: warning ?? undefined });
      onDeleted?.();

      if (typeof redirectTo === 'string' && redirectTo.trim().length > 0) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to remove listing', error);
      const description = error instanceof Error && error.message.trim().length > 0 ? error.message : t('product.removeListingFailedHint');
      toast({
        title: t('product.removeListingFailed'),
        description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [loading, onDeleted, productId, redirectTo, router, t]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size={size} className={className} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t('product.removeListing')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('product.removeListingConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('product.removeListingConfirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('report.cancel')}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button type="button" variant="destructive" onClick={removeListing} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('product.removeListingConfirmAction')}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
