import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export const POST = withSentryRoute(async (request: Request) => {
  const { sellerId, buyerId, productId } = (await request.json().catch(() => ({}))) as {
    sellerId?: string;
    buyerId?: string;
    productId?: string | null;
  };

  if (!sellerId || !buyerId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (user.id !== buyerId && user.id !== sellerId)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_seller_id: sellerId,
    p_buyer_id: buyerId,
    p_product_id: productId ?? null,
  });

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to open conversation' }, { status: 500 });
  }

  return NextResponse.json({ id: String(data) });
}, 'messages-conversation-create-or-get');

