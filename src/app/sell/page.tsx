import AppLayout from '@/components/layout/app-layout';
import { createClient as createSupabaseServiceRole, type User } from '@supabase/supabase-js';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import SellForm from './sell-form';

export const runtime = 'nodejs';

type SellPageSearchParams = {
  store?: string;
};

type SellStoreContext = {
  id: string;
  name: string;
  slug: string | null;
  ownerUserId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveSellStoreContext(storeParam: string, user: User | null): Promise<SellStoreContext | null> {
  const normalized = storeParam.trim();
  if (!normalized || !user) return null;

  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const baseQuery = supabaseAdmin
    .from('sponsor_stores')
    .select('id, name, slug, owner_user_id');

  const storeRes = UUID_RE.test(normalized)
    ? await baseQuery.eq('id', normalized).maybeSingle()
    : await baseQuery.eq('slug', normalized).maybeSingle();

  const store = storeRes.data as { id?: string; name?: string | null; slug?: string | null; owner_user_id?: string | null } | null;
  if (storeRes.error || !store?.id) {
    return null;
  }

  const context: SellStoreContext = {
    id: store.id,
    name: (store.name ?? '').trim() || 'Store',
    slug: store.slug ?? null,
    ownerUserId: store.owner_user_id ?? null,
  };

  if (isModerator(user)) {
    return context;
  }

  if (context.ownerUserId && context.ownerUserId === user.id) {
    return context;
  }

  const managerRes = await supabaseAdmin
    .from('sponsor_store_staff')
    .select('id')
    .eq('store_id', context.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();

  if (!managerRes.error && managerRes.data?.id) {
    return context;
  }

  return null;
}

export default async function SellPage({
  searchParams,
}: {
  searchParams?: Promise<SellPageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const storeParam = typeof params.store === 'string' ? params.store : '';
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const storeContext = await resolveSellStoreContext(storeParam, user);

  return (
    <AppLayout user={user}>
      <SellForm user={user} storeContext={storeContext} />
    </AppLayout>
  );
}
