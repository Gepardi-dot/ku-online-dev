import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';
import StoreSettingsForm, { type SponsorStoreSettings } from './StoreSettingsForm';
import OffersManager, { type SponsorOfferItem } from './OffersManager';
import StaffManager, { type SponsorStaffItem, type SponsorStaffUser } from './StaffManager';

export const dynamic = 'force-dynamic';

type SponsorStoreRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  primary_city: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  owner_user_id?: string | null;
  status: string | null;
  sponsor_tier: string | null;
  is_featured: boolean | null;
};

type OfferRow = {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  status: string | null;
  end_at: string | null;
  is_featured: boolean | null;
  discount_type: string | null;
  discount_value: number | string | null;
  currency: string | null;
  original_price?: number | string | null;
  deal_price?: number | string | null;
};

type StaffRow = {
  id: string;
  user_id: string;
  role: string | null;
  status: string | null;
  created_at: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  name: string | null;
  phone: string | null;
};

function statusBadgeVariant(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') return 'default';
  if (normalized === 'disabled') return 'destructive';
  return 'secondary';
}

export default async function AdminSponsorStorePage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  const storeId = (await params).id;

  const { data: storeData, error: storeError } = await supabase
    .from('sponsor_stores')
    .select('id,name,slug,description,logo_url,cover_url,primary_city,phone,whatsapp,website,owner_user_id,status,sponsor_tier,is_featured')
    .eq('id', storeId)
    .maybeSingle();

  if (storeError) {
    console.error('Failed to load sponsor store (admin)', storeError);
  }

  const store = storeData as unknown as SponsorStoreRow | null;
  if (!store) {
    redirect('/admin/sponsors');
  }

  const { data: offerData, error: offerError } = await supabase
    .from('sponsor_offers')
    .select('id,title,description,terms,status,end_at,is_featured,discount_type,discount_value,currency,original_price,deal_price')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (offerError) {
    console.error('Failed to load sponsor offers (admin)', offerError);
  }

  const offers = ((offerData ?? []) as unknown as OfferRow[]).map(
    (row): SponsorOfferItem => ({
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      terms: row.terms ?? null,
      status: (row.status ?? 'active').trim().toLowerCase(),
      endAt: row.end_at ?? null,
      isFeatured: Boolean(row.is_featured),
      discountType: row.discount_type ?? 'custom',
      discountValue: row.discount_value ?? null,
      currency: row.currency ?? null,
      originalPrice: row.original_price ?? null,
      dealPrice: row.deal_price ?? null,
    }),
  );

  const { data: staffData, error: staffError } = await supabase
    .from('sponsor_store_staff')
    .select('id,user_id,role,status,created_at')
    .eq('store_id', store.id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (staffError) {
    console.error('Failed to load sponsor staff (admin)', staffError);
  }

  const staff = (staffData ?? []) as unknown as StaffRow[];

  const env = getEnv();
  const supabaseServiceRole =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : null;

  let usersById: Record<string, SponsorStaffUser> = {};
  if (supabaseServiceRole && staff.length > 0) {
    const userIds = Array.from(new Set(staff.map((s) => s.user_id)));
    const { data: userData, error: usersError } = await supabaseServiceRole
      .from('users')
      .select('id,email,full_name,name,phone')
      .in('id', userIds)
      .limit(200);
    if (usersError) {
      console.error('Failed to load staff users (service role)', usersError);
    } else {
      const rows = (userData ?? []) as unknown as UserRow[];
      usersById = Object.fromEntries(
        rows.map((u) => [
          u.id,
          {
            id: u.id,
            label: u.full_name ?? u.name ?? u.email ?? u.phone ?? u.id,
            email: u.email ?? null,
            phone: u.phone ?? null,
          },
        ]),
      );
    }
  }

  const staffItems: SponsorStaffItem[] = staff.map((s) => ({
    id: s.id,
    userId: s.user_id,
    user: usersById[s.user_id] ?? null,
    role: (s.role ?? 'cashier').trim().toLowerCase(),
    status: (s.status ?? 'active').trim().toLowerCase(),
    createdAt: s.created_at ?? null,
  }));

  const settings: SponsorStoreSettings = {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description ?? '',
    logoUrl: store.logo_url ?? '',
    coverUrl: store.cover_url ?? '',
    primaryCity: store.primary_city ?? '',
    phone: store.phone ?? '',
    whatsapp: store.whatsapp ?? '',
    website: store.website ?? '',
    ownerUserId: store.owner_user_id ?? '',
    status: (store.status ?? 'pending').trim().toLowerCase(),
    sponsorTier: (store.sponsor_tier ?? 'basic').trim().toLowerCase(),
    isFeatured: Boolean(store.is_featured),
  };

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{store.name}</h1>
              <Badge variant={statusBadgeVariant(store.status ?? 'pending') as any}>{(store.status ?? 'pending').toLowerCase()}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">/{store.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full bg-white/80">
              <Link href="/admin/sponsors">Back</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href={`/sponsors/stores/${store.slug}`} target="_blank" rel="noreferrer">
                View public
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Manage</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="store">
              <TabsList className="w-full">
                <TabsTrigger value="store" className="flex-1">
                  Store
                </TabsTrigger>
                <TabsTrigger value="offers" className="flex-1">
                  Offers ({offers.length})
                </TabsTrigger>
                <TabsTrigger value="staff" className="flex-1">
                  Staff ({staffItems.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="store" className="mt-6">
                <StoreSettingsForm initial={settings} />
              </TabsContent>

              <TabsContent value="offers" className="mt-6">
                <OffersManager storeId={store.id} initialOffers={offers} />
              </TabsContent>

              <TabsContent value="staff" className="mt-6">
                <StaffManager storeId={store.id} initialStaff={staffItems} serviceRoleEnabled={Boolean(supabaseServiceRole)} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
