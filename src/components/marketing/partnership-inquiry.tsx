'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLocale } from '@/providers/locale-provider';
import { cn } from '@/lib/utils';

type PartnershipInquiryProps = {
  buttonClassName?: string;
  className?: string;
};

function PartnershipInquiryFallback() {
  const { t } = useLocale();

  return (
    <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('partnership.formTitle')}</DialogTitle>
        <DialogDescription>{t('partnership.formDescription')}</DialogDescription>
      </DialogHeader>
      <div className="py-10 text-center text-muted-foreground">Loading...</div>
    </DialogContent>
  );
}

const PartnershipInquiryForm = dynamic(
  () => import('@/components/marketing/partnership-inquiry-form').then((mod) => mod.PartnershipInquiryForm),
  {
    ssr: false,
    loading: () => <PartnershipInquiryFallback />,
  },
);

export function PartnershipInquiry({ buttonClassName, className }: PartnershipInquiryProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

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
            {t('partnership.ctaButton')}
          </Button>
        </DialogTrigger>
        {open ? <PartnershipInquiryForm onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </div>
  );
}
