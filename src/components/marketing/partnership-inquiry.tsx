'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLocale } from '@/providers/locale-provider';
import { cn } from '@/lib/utils';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';

type PartnershipInquiryProps = {
  buttonClassName?: string;
  className?: string;
  mode?: 'partner' | 'seller';
  isSignedIn?: boolean;
};

function PartnershipInquiryFallback({ mode }: { mode: 'partner' | 'seller' }) {
  const { t } = useLocale();
  const title = mode === 'seller' ? t('partnership.sellerFormTitle') : t('partnership.formTitle');
  const description = mode === 'seller' ? t('partnership.sellerFormDescription') : t('partnership.formDescription');

  return (
    <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="py-10 text-center text-muted-foreground">Loading...</div>
    </DialogContent>
  );
}

const PartnershipInquiryForm = dynamic(
  () => import('@/components/marketing/partnership-inquiry-form').then((mod) => mod.PartnershipInquiryForm),
  {
    ssr: false,
    loading: () => <PartnershipInquiryFallback mode="partner" />,
  },
);

export function PartnershipInquiry({
  buttonClassName,
  className,
  mode = 'partner',
  isSignedIn = false,
}: PartnershipInquiryProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const buttonLabel = mode === 'seller' ? t('partnership.sellerCtaButton') : t('partnership.ctaButton');
  const formTitle = mode === 'seller' ? t('partnership.sellerFormTitle') : t('partnership.formTitle');
  const formDescription = mode === 'seller' ? t('partnership.sellerFormDescription') : t('partnership.formDescription');

  return (
    <div className={cn('flex flex-col items-center gap-4 md:items-start', className)}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            className={cn(
              'h-11 w-full rounded-full bg-white px-6 text-base font-semibold text-primary shadow-sm hover:bg-white/90 md:w-auto',
              buttonClassName,
            )}
          >
            {buttonLabel}
          </Button>
        </DialogTrigger>
        {open ? (
          <PartnershipInquiryForm
            onClose={() => setOpen(false)}
            mode={mode}
            isSignedIn={isSignedIn}
            initialPartnershipType={mode === 'seller' ? SELLER_APPLICATION_TYPE : undefined}
            panelTitle={formTitle}
            panelDescription={formDescription}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
