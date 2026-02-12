import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { SponsorServicesManager, type SponsorServiceItem } from '@/components/sponsors/SponsorServicesManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdmin } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
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
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
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

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getStoreForUser(userId: string) {
  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Prefer direct owner store.
  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, status, owner_user_id, cover_url, phone, whatsapp, website')
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
    .select('store_id, role, status, sponsor_stores ( id, name, slug, status, owner_user_id, cover_url, phone, whatsapp, website )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();

  const store = (staffRes.data as any)?.sponsor_stores as StoreRow | null | undefined;
  return store?.id ? store : null;
}

async function getStoreBySlugOrId(value: string): Promise<StoreRow | null> {
  const normalized = value.trim();
  if (!normalized) return null;

  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const bySlug = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, status, owner_user_id, cover_url, phone, whatsapp, website')
    .eq('slug', normalized)
    .maybeSingle();

  if (!bySlug.error && bySlug.data?.id) {
    return bySlug.data as StoreRow;
  }

  if (!UUID_RE.test(normalized)) {
    return null;
  }

  const byId = await supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, status, owner_user_id, cover_url, phone, whatsapp, website')
    .eq('id', normalized)
    .maybeSingle();

  if (!byId.error && byId.data?.id) {
    return byId.data as StoreRow;
  }

  return null;
}

async function canUserManageStoreById(userId: string, storeId: string): Promise<boolean> {
  if (!userId || !storeId) return false;

  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const ownerRes = await supabaseAdmin
    .from('sponsor_stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (!ownerRes.error && ownerRes.data?.id) {
    return true;
  }

  const staffRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('store_id')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'manager')
    .maybeSingle();

  return !staffRes.error && Boolean(staffRes.data?.store_id);
}

export default async function SponsorManagePage({
  searchParams,
}: {
  searchParams?: Promise<{ store?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);
  const params = searchParams ? await searchParams : {};
  const requestedStore = typeof params.store === 'string' ? params.store.trim() : '';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const canDeleteStore = isAdmin(user);
  let store: StoreRow | null = null;

  if (requestedStore) {
    if (canDeleteStore) {
      store = await getStoreBySlugOrId(requestedStore);
    } else {
      const requested = await getStoreBySlugOrId(requestedStore);
      if (requested && (await canUserManageStoreById(user.id, requested.id))) {
        store = requested;
      }
    }
  }

  if (!store) {
    store = await getStoreForUser(user.id);
  }

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
  const { data: primaryLocation } = await supabaseAdmin
    .from('sponsor_store_locations')
    .select('address, is_primary, updated_at')
    .eq('store_id', store.id)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
  const endsLabelTemplate = t('sponsorsHub.endsIn');
  const manageHref = store.slug ? `/sponsors/manage?store=${encodeURIComponent(store.slug)}` : '/sponsors/manage';
  const addProductHref = `/sell?returnTo=${encodeURIComponent(manageHref)}`;

  return (
    <AppLayout user={user}>
      <div className="mx-auto w-full max-w-5xl px-4 py-4 md:py-5">
        <section className="mb-3 rounded-[20px] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(255,255,255,0.72)_45%,_rgba(241,245,249,0.86))] p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.09)] ring-1 ring-white/40 md:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex rounded-full border border-black/10 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Store offers workspace
              </p>
              <h1 className="mt-1.5 text-lg font-extrabold text-[#111827] md:text-xl" dir="auto">
                {t('sponsorManage.title')}
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground md:text-sm" dir="auto">
                {t('sponsorManage.subtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/sponsors/stores/${store.slug ?? store.id}`}
                className="rounded-md border border-black/10 bg-white/90 px-3 py-1 text-xs font-semibold text-brand shadow-sm transition-colors hover:bg-white"
              >
                <span dir="auto">{t('sponsorManage.viewStore')}</span>
              </Link>
              <Link
                href={addProductHref}
                className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand/90"
              >
                <span dir="auto">{t('sponsorManage.addProduct')}</span>
              </Link>
            </div>
          </div>

          <div className="mt-2.5 grid gap-1.5 md:grid-cols-3">
            <div className="rounded-xl border border-white/70 bg-white/75 p-2 ring-1 ring-black/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Offer quality</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#111827]">Use clear titles and exact discount value.</p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/75 p-2 ring-1 ring-black/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Store card image</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#111827]">Upload a clean 16:9 design for the best preview.</p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/75 p-2 ring-1 ring-black/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Publishing</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#111827]">Pause or resume offers anytime from the list below.</p>
            </div>
          </div>
        </section>

        <SponsorServicesManager
          store={{
            id: store.id,
            name: store.name ?? 'Store',
            slug: store.slug ?? store.id,
            coverUrl: normalizeStoreCoverUrl(store.cover_url ?? null),
            phone: normalizeNullable(store.phone),
            whatsapp: normalizeNullable(store.whatsapp),
            website: normalizeNullable(store.website),
            directionsUrl: normalizeNullable((primaryLocation as { address?: string | null } | null)?.address ?? null),
          }}
          initialItems={items}
          locale={locale}
          sponsoredLabel={sponsoredLabel}
          endsLabelTemplate={endsLabelTemplate}
          canDeleteStore={canDeleteStore}
          isAdmin={canDeleteStore}
        />
      </div>
    </AppLayout>
  );
}
