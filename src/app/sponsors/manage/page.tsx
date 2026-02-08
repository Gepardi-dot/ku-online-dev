import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { SponsorManageLivePerformance } from '@/components/sponsors/SponsorManageLivePerformance';
import { SponsorServicesManager, type SponsorServiceItem } from '@/components/sponsors/SponsorServicesManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { getSponsorLiveStatsVisibility } from '@/lib/services/app-settings';
import { getSponsorStoreLiveStats } from '@/lib/services/sponsors';
import { buildPublicStorageUrl } from '@/lib/storage-public';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type StoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  owner_user_id: string | null;
  cover_url: string | null;
};

type OfferRow = {
  id: string;
  title: string | null;
  description: string | null;
  discount_type: string | null;
  discount_value: number | string | null;
  currency: string | null;
  end_at: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeStoreCoverUrl(value: string | null): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (normalized.startsWith('/') || /^https?:\/\//i.test(normalized)) return normalized;
  return buildPublicStorageUrl(normalized) ?? normalized;
}

async function getStoreForUser(userId: string) {
  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Prefer direct owner store.
  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, status, owner_user_id, cover_url')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ownerRes.error && ownerRes.data?.id) {
    return ownerRes.data as StoreRow;
  }

  // Fallback: allow store managers to manage services too.
  const staffRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('store_id, role, status, sponsor_stores ( id, name, slug, status, owner_user_id, cover_url )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();

  const store = (staffRes.data as any)?.sponsor_stores as StoreRow | null | undefined;
  return store?.id ? store : null;
}

export default async function SponsorManagePage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const store = await getStoreForUser(user.id);

  if (!store) {
    return (
      <AppLayout user={user}>
        <div className="container mx-auto px-4 py-8">
          <Card className="rounded-[24px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 shadow-[0_10px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
            <CardHeader>
              <CardTitle className="text-brand" dir="auto">
                {t('sponsorManage.noStoreTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground" dir="auto">
              {t('sponsorManage.noStoreBody')}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: offers } = await supabaseAdmin
    .from('sponsor_offers')
    .select('id, title, description, discount_type, discount_value, currency, end_at, status, created_at, updated_at')
    .eq('store_id', store.id)
    .order('updated_at', { ascending: false })
    .limit(200);

  const items: SponsorServiceItem[] = (offers ?? [])
    .map((row) => row as unknown as OfferRow)
    .map((row) => ({
      id: row.id,
      title: row.title ?? '',
      description: row.description ?? null,
      discountType: (row.discount_type ?? 'custom') as SponsorServiceItem['discountType'],
      discountValue: row.discount_value ?? null,
      currency: row.currency ?? null,
      endAt: row.end_at ?? null,
      status: row.status ?? 'active',
    }))
    .filter((row) => row.title.trim().length > 0);

  const sponsoredLabel = t('sponsorsHub.sponsoredBadge');
  const endsLabel = (time: string) => t('sponsorsHub.endsIn').replace('{time}', time);
  const liveStatsVisibility = await getSponsorLiveStatsVisibility();
  const showLiveStats = isModerator(user) || liveStatsVisibility.publicVisible;
  const liveStats = showLiveStats ? await getSponsorStoreLiveStats(store.id) : null;

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-[#111827]" dir="auto">
              {t('sponsorManage.title')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="auto">
              {t('sponsorManage.subtitle')}
            </p>
          </div>
          <Link
            href={`/sponsors/stores/${store.slug ?? store.id}`}
            className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-brand shadow-sm hover:bg-white"
          >
            <span dir="auto">{t('sponsorManage.viewStore')}</span>
          </Link>
        </div>

        {showLiveStats && liveStats ? (
          <SponsorManageLivePerformance
            storeId={store.id}
            locale={locale}
            initialStats={liveStats}
            title={t('sponsorsHub.liveStats.performanceTitle')}
            subtitle={t('sponsorsHub.liveStats.performanceDescription')}
            viewsLabel={t('sponsorsHub.liveStats.views')}
            likesLabel={t('sponsorsHub.liveStats.likes')}
          />
        ) : null}

        <SponsorServicesManager
          store={{
            id: store.id,
            name: store.name ?? 'Store',
            slug: store.slug ?? store.id,
            coverUrl: normalizeStoreCoverUrl(store.cover_url ?? null),
          }}
          initialItems={items}
          locale={locale}
          sponsoredLabel={sponsoredLabel}
          endsLabel={endsLabel}
        />
      </div>
    </AppLayout>
  );
}
