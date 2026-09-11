'use client';

import { PartnershipInquiryForm } from '@/components/marketing/partnership-inquiry-form';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';
import { useLocale } from '@/providers/locale-provider';
import { cn } from '@/lib/utils';

type SellerApplicationPanelProps = {
  isSignedIn?: boolean;
  className?: string;
};

export function SellerApplicationPanel({ isSignedIn = false, className }: SellerApplicationPanelProps) {
  const { t } = useLocale();

  return (
    <div className={cn(className)}>
      <PartnershipInquiryForm
        onClose={() => undefined}
        mode="seller"
        isSignedIn={isSignedIn}
        initialPartnershipType={SELLER_APPLICATION_TYPE}
        panelTitle={t('partnership.sellerFormTitle')}
        panelDescription={t('partnership.sellerFormDescription')}
        asDialog={false}
      />
    </div>
  );
}
