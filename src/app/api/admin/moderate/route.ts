import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@supabase/supabase-js';
import { syncAlgoliaProductById } from '@/lib/services/algolia-products';

const { ADMIN_REVALIDATE_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
const supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const runtime = 'nodejs';

export const POST = withSentryRoute(async (req: Request) => {
  const token = req.headers.get('x-admin-token') ?? '';
  if (!ADMIN_REVALIDATE_TOKEN || token !== ADMIN_REVALIDATE_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { productId?: string; active?: boolean };
  const productId = body.productId;
  const active = typeof body.active === 'boolean' ? body.active : false;

  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('products')
    .update({ is_active: active })
    .eq('id', productId)
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  try {
    await syncAlgoliaProductById(productId, supabaseAdmin);
  } catch (syncError) {
    console.warn('Algolia sync failed after moderation update', syncError);
  }

  return NextResponse.json({ ok: true, productId, is_active: active });
});
