'use client';

import { useState } from 'react';

import { PartnershipInquiryForm } from '@/components/marketing/partnership-inquiry-form';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';
import { useLocale } from '@/providers/locale-provider';

type SellerApplicationButtonProps = {
  isSignedIn?: boolean;
};

export function SellerApplicationButton({ isSignedIn = false }: SellerApplicationButtonProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="seller-application-button"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(247,111,29,0.28)] transition hover:bg-brand/90"
        >
          {t('partnership.sellerCtaButton')}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <PartnershipInquiryForm
          onClose={() => setOpen(false)}
          mode="seller"
          isSignedIn={isSignedIn}
          initialPartnershipType={SELLER_APPLICATION_TYPE}
          panelTitle={t('partnership.sellerFormTitle')}
          panelDescription={t('partnership.sellerFormDescription')}
          asDialog={false}
        />
      </DialogContent>
    </Dialog>
  );
}
