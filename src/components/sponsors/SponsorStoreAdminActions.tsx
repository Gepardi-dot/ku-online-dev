'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';
import { cn } from '@/lib/utils';

type SponsorStoreAdminActionsProps = {
  storeId: string;
  storeName: string;
  editHref: string;
  addProductHref: string;
  canRemove: boolean;
  isRtl?: boolean;
};

export function SponsorStoreAdminActions({
  storeId,
  storeName,
  editHref,
  addProductHref,
  canRemove,
  isRtl = false,
}: SponsorStoreAdminActionsProps) {
  const { t } = useLocale();
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const removeStore = useCallback(async () => {
    if (!canRemove || removing) {
      return;
    }

    setRemoving(true);
    try {
      const response = await fetch(`/api/sponsors/store?storeId=${encodeURIComponent(storeId)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!response.ok || payload.ok !== true) {
        throw new Error(typeof payload.error === 'string' ? payload.error : t('sponsorManage.removeFailed'));
      }

      toast({ title: t('sponsorManage.removeSuccess') });
      router.push('/sponsors');
      router.refresh();
    } catch (error) {
      console.error('Failed to remove sponsor store', error);
      toast({
        title: t('sponsorManage.removeFailed'),
        description: error instanceof Error && error.message.trim() ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  }, [canRemove, removing, router, storeId, t]);

  const buttonRowClass = cn('flex flex-wrap items-center gap-2', isRtl && 'flex-row-reverse');
  const buttonClass = cn(isRtl && 'flex-row-reverse');

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className={buttonRowClass}>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-9 rounded-full border-black/10 bg-white/70 px-3.5 text-xs font-bold shadow-sm hover:bg-white"
        >
          <Link href={editHref} prefetch={false} className={buttonClass}>
            {t('sponsorManage.editButton')}
          </Link>
        </Button>

        <Button asChild size="sm" className="h-9 rounded-full px-3.5 text-xs font-bold">
          <Link href={addProductHref} prefetch={false} className={buttonClass}>
            {t('sponsorManage.addProduct')}
          </Link>
        </Button>

        {canRemove ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-full border-red-200 bg-white/80 px-3.5 text-xs font-bold text-red-700 shadow-sm hover:bg-red-50"
                disabled={removing}
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {t('sponsorManage.removeButton')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('sponsorManage.removeConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('sponsorManage.removeConfirmDescription').replace('{name}', storeName)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('report.cancel')}</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button type="button" variant="destructive" onClick={() => void removeStore()} disabled={removing}>
                    {removing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {t('sponsorManage.removeConfirmAction')}
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}
