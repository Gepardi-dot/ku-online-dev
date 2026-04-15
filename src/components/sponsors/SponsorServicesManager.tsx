'use client';

import type { Locale } from '@/lib/locale/dictionary';
import {
  SponsorStoreSetupSections,
  type SponsorServiceDiscountType,
  type SponsorServiceItem,
  type SponsorStoreSetupInfo,
} from '@/components/sponsors/SponsorStoreSetupSections';

type StoreInfo = SponsorStoreSetupInfo;

export function SponsorServicesManager({
  store,
  initialItems,
  locale,
  sponsoredLabel,
  endsLabelTemplate,
  canDeleteStore = false,
  isAdmin = false,
  mode = 'remote',
}: {
  store: StoreInfo;
  initialItems: SponsorServiceItem[];
  locale: Locale;
  sponsoredLabel: string;
  endsLabelTemplate: string;
  canDeleteStore?: boolean;
  isAdmin?: boolean;
  mode?: 'remote' | 'mock';
}) {
  return (
    <SponsorStoreSetupSections
      store={store}
      initialItems={initialItems}
      locale={locale}
      sponsoredLabel={sponsoredLabel}
      endsLabelTemplate={endsLabelTemplate}
      canDeleteStore={canDeleteStore}
      isAdmin={isAdmin}
      mode={mode}
      hydrateOnMount={false}
      showGlobalSaveButton
    />
  );
}

export type { SponsorServiceDiscountType, SponsorServiceItem };
