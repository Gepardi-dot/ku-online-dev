import { cookies } from 'next/headers';
import type { Metadata } from 'next';

import AppLayout from '@/components/layout/app-layout';
import { ServicesMarketplacePreview } from '@/components/services/ServicesMarketplaceMinimal';
import { createClient } from '@/utils/supabase/server';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Local services marketplace preview with mock providers.',
};

export default async function ServicesPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <ServicesMarketplacePreview />
    </AppLayout>
  );
}
