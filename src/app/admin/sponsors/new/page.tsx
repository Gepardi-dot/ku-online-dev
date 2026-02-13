import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { normalizeMarketCityValue } from '@/data/market-cities';
import { isAdmin } from '@/lib/auth/roles';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { createClient } from '@/utils/supabase/server';
import NewSponsorStoreForm from './new-sponsor-store-form';

type NewSponsorStoreSearchParams = {
  name?: string;
  ownerUserId?: string;
  city?: string;
  phone?: string;
  website?: string;
  whatsapp?: string;
};

export default async function NewSponsorStorePage({
  searchParams,
}: {
  searchParams?: Promise<NewSponsorStoreSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user)) {
    redirect('/');
  }

  const initialName = typeof params.name === 'string' ? params.name : '';
  const initialOwnerUserId =
    typeof params.ownerUserId === 'string' && params.ownerUserId.trim().length > 0 ? params.ownerUserId : user.id;
  const initialPrimaryCity = normalizeMarketCityValue(typeof params.city === 'string' ? params.city : '');
  const initialPhone = typeof params.phone === 'string' ? params.phone : '';
  const initialWebsite = typeof params.website === 'string' ? params.website : '';
  const initialWhatsapp = typeof params.whatsapp === 'string' ? params.whatsapp : '';
  const locale = await getServerLocale();
  const sponsoredLabel = serverTranslate(locale, 'sponsorsHub.sponsoredBadge');
  const endsLabelTemplate = serverTranslate(locale, 'sponsorsHub.endsIn');

  return (
    <AppLayout user={user}>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4">
          <Link
            href="/sponsors"
            className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-white"
          >
            Back to Sponsors
          </Link>
        </div>

        <Card className="rounded-[24px] border border-white/60 bg-linear-to-br from-white/78 via-white/68 to-white/45 shadow-[0_16px_48px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-extrabold text-[#111827]">Create sponsor store</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create and finish the full sponsor store setup in this single page.
            </p>
          </CardHeader>
          <CardContent>
            <NewSponsorStoreForm
              initialName={initialName}
              initialOwnerUserId={initialOwnerUserId}
              initialPrimaryCity={initialPrimaryCity}
              initialPhone={initialPhone}
              initialWebsite={initialWebsite}
              initialWhatsapp={initialWhatsapp}
              locale={locale}
              sponsoredLabel={sponsoredLabel}
              endsLabelTemplate={endsLabelTemplate}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
