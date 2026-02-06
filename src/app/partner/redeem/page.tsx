import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/server';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import RedeemForm, { type PartnerStoreOption, type RecentRedemptionItem } from './RedeemForm';

export const dynamic = 'force-dynamic';

interface PartnerRedeemSearchParams {
  storeId?: string;
}

type StaffMembershipRow = {
  id: string;
  role: string | null;
  store: {
    id: string;
    name: string;
    slug: string | null;
    primary_city: string | null;
    status: string | null;
    logo_url: string | null;
  } | null;
};

type RedemptionRow = {
  id: string;
  redeemed_at: string | null;
  offer: { id: string; title: string | null } | null;
};

function toStoreOptions(rows: StaffMembershipRow[]): PartnerStoreOption[] {
  return rows
    .map((row) => {
      if (!row.store) return null;
      return {
        id: row.store.id,
        name: row.store.name,
        slug: row.store.slug,
        city: row.store.primary_city ?? null,
        status: row.store.status ?? null,
        role: (row.role ?? 'cashier').toLowerCase(),
        logoUrl: row.store.logo_url ?? null,
      };
    })
    .filter((v): v is PartnerStoreOption => Boolean(v));
}

function toRecentItems(rows: RedemptionRow[]): RecentRedemptionItem[] {
  return rows.map((row) => ({
    id: row.id,
    redeemedAt: row.redeemed_at ?? null,
    offerId: row.offer?.id ?? null,
    offerTitle: row.offer?.title ?? null,
  }));
}

export default async function PartnerRedeemPage({ searchParams }: { searchParams: Promise<PartnerRedeemSearchParams> }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const locale = await getServerLocale();
  const params = await searchParams;

  const { data: staffData, error: staffError } = await supabase
    .from('sponsor_store_staff')
    .select(
      `
      id,
      role,
      store:sponsor_stores(
        id,
        name,
        slug,
        primary_city,
        status,
        logo_url
      )
    `,
    )
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(50);

  if (staffError) {
    console.error('Failed to load partner staff memberships', staffError);
  }

  const stores = toStoreOptions((staffData ?? []) as unknown as StaffMembershipRow[]);
  const requestedStoreId = typeof params.storeId === 'string' ? params.storeId : null;
  const initialStoreId = stores.some((s) => s.id === requestedStoreId) ? requestedStoreId! : stores[0]?.id ?? null;

  let initialRecent: RecentRedemptionItem[] = [];
  if (initialStoreId) {
    const { data: redemptionData, error: redemptionError } = await supabase
      .from('sponsor_redemptions')
      .select(
        `
        id,
        redeemed_at,
        offer:sponsor_offers(
          id,
          title
        )
      `,
      )
      .eq('store_id', initialStoreId)
      .order('redeemed_at', { ascending: false })
      .limit(10);

    if (redemptionError) {
      console.error('Failed to load partner redemptions', redemptionError);
    } else {
      initialRecent = toRecentItems((redemptionData ?? []) as unknown as RedemptionRow[]);
    }
  }

  return (
    <AppLayout user={user}>
      <section className="pt-10 pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-7">
              <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
                {serverTranslate(locale, 'partnerRedeem.title')}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                {serverTranslate(locale, 'partnerRedeem.subtitle')}
              </p>
            </div>

            {stores.length === 0 || !initialStoreId ? (
              <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-sm ring-1 ring-black/5">
                <h2 className="text-lg font-semibold text-[#2D2D2D]" dir="auto">
                  {serverTranslate(locale, 'partnerRedeem.noAccessTitle')}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                  {serverTranslate(locale, 'partnerRedeem.noAccessDescription')}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild className="rounded-full">
                    <Link href="/sponsors">{serverTranslate(locale, 'partnerRedeem.goToSponsors')}</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full bg-white/80">
                    <Link href="/">{serverTranslate(locale, 'partnerRedeem.backHome')}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <RedeemForm stores={stores} initialStoreId={initialStoreId} initialRecent={initialRecent} />
            )}
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

