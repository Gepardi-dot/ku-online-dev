import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export const GET = withSentryRoute(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (userId && userId !== user.id)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('conversations')
    .select(
      `id, product_id, seller_id, buyer_id, last_message, last_message_at, updated_at,
       product:products(id, title, price, currency, images),
       seller:public_user_profiles!inner(id, full_name, avatar_url),
       buyer:public_user_profiles!inner(id, full_name, avatar_url)`,
    )
    .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
    .order('updated_at', { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }

  const conversations = (data ?? []).map((row) => ({
    id: String(row.id),
    productId: row.product_id ? String(row.product_id) : null,
    sellerId: String(row.seller_id),
    buyerId: String(row.buyer_id),
    lastMessage: (row.last_message as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    product: row.product
      ? {
          id: String(row.product.id),
          title: (row.product.title as string) ?? 'Untitled',
          price: row.product.price as number | null,
          currency: (row.product.currency as string) ?? 'IQD',
          imagePaths: (row.product.images as string[]) ?? [],
          imageUrls: (row.product.images as string[]) ?? [],
        }
      : null,
    seller: row.seller
      ? {
          id: String((row.seller as any).id),
          fullName: ((row.seller as any).full_name as string | null) ?? null,
          avatarUrl: ((row.seller as any).avatar_url as string | null) ?? null,
        }
      : null,
    buyer: row.buyer
      ? {
          id: String((row.buyer as any).id),
          fullName: ((row.buyer as any).full_name as string | null) ?? null,
          avatarUrl: ((row.buyer as any).avatar_url as string | null) ?? null,
        }
      : null,
  }));

  return NextResponse.json({ conversations });
}, 'messages-conversation-list');

