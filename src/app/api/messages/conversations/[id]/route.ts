import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export const GET = withSentryRoute(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id: conversationId } = await context.params;

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversation id' }, { status: 400 });
    }

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

    if (!user) {
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
    .eq('id', conversationId)
    .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ conversation: null });
    }

    if (data.seller_id !== user.id && data.buyer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const productRecord = Array.isArray(data.product) ? data.product[0] : data.product;

    const conversation = {
      id: String(data.id),
      productId: data.product_id ? String(data.product_id) : null,
      sellerId: String(data.seller_id),
      buyerId: String(data.buyer_id),
      lastMessage: (data.last_message as string | null) ?? null,
      lastMessageAt: (data.last_message_at as string | null) ?? null,
      updatedAt: (data.updated_at as string | null) ?? null,
      product: productRecord
        ? {
            id: String(productRecord.id),
            title: (productRecord.title as string) ?? 'Untitled',
            price: productRecord.price as number | null,
            currency: (productRecord.currency as string) ?? 'IQD',
            imagePaths: (productRecord.images as string[]) ?? [],
            imageUrls: (productRecord.images as string[]) ?? [],
          }
        : null,
      seller: data.seller
        ? {
            id: String((data.seller as any).id),
            fullName: ((data.seller as any).full_name as string | null) ?? null,
            avatarUrl: ((data.seller as any).avatar_url as string | null) ?? null,
          }
        : null,
      buyer: data.buyer
        ? {
            id: String((data.buyer as any).id),
            fullName: ((data.buyer as any).full_name as string | null) ?? null,
            avatarUrl: ((data.buyer as any).avatar_url as string | null) ?? null,
          }
        : null,
    };

    return NextResponse.json({ conversation });
  },
  'messages-conversation-detail',
);
