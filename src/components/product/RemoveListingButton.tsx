'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';

import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
        <Button
          type="button"
          variant="outline"
          size={size}
          className={cn(
            size === 'sm' ? 'h-9 rounded-md' : 'h-10 rounded-md',
            "border border-dashed border-red-200/80 bg-white/70 text-red-700 shadow-[0_8px_20px_rgba(248,113,113,0.18)] hover:bg-red-50 hover:text-red-700",
            className,
          )}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200/70">
              <Trash2 className="h-4 w-4" />
            </span>
          )}
          <span className="text-sm font-semibold">
            {t('product.removeListing')}
          </span>
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
