import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type ConversationDetailRow = {
  id: string;
  product_id: string | null;
  seller_id: string;
  buyer_id: string;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  product_title: string | null;
  product_price: number | string | null;
  product_currency: string | null;
  product_image: string | null;
  seller_full_name: string | null;
  seller_avatar_url: string | null;
  buyer_full_name: string | null;
  buyer_avatar_url: string | null;
};

export const DELETE = withSentryRoute(
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

    const { error } = await supabase.rpc('delete_conversation_secure', {
      p_conversation_id: conversationId,
    });

    if (error) {
      const code = (error.code ?? '').toUpperCase();
      const message = (error.message ?? '').toLowerCase();
      if (code === '28000' || message.includes('not_authenticated')) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (code === '42501' || message.includes('forbidden')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (code === '22P02' || message.includes('invalid input syntax for type uuid')) {
        return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
      }
      console.error('Conversation delete failed', { code: error.code, message: error.message, details: error.details });
      return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  },
  'messages-conversation-delete',
);

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
      .rpc('get_conversation_detail_secure', { p_conversation_id: conversationId })
      .maybeSingle();

    if (error) {
      const code = (error.code ?? '').toUpperCase();
      const message = (error.message ?? '').toLowerCase();
      if (code === '42501' || message.includes('forbidden')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      console.error('Conversation detail query failed', { code: error.code, message: error.message, details: error.details, hint: error.hint });
      return NextResponse.json(
        { error: 'Failed to load conversation', code: error.code ?? null, message: error.message ?? null, details: error.details ?? null },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ conversation: null });
    }

    const row = data as unknown as ConversationDetailRow;
    const productPrice =
      typeof row.product_price === 'number'
        ? row.product_price
        : row.product_price
          ? Number(row.product_price)
          : null;
    const previewImagePaths = row.product_image && row.product_image.trim().length > 0 ? [row.product_image] : [];

    const conversation = {
      id: String(row.id),
      productId: row.product_id ? String(row.product_id) : null,
      sellerId: String(row.seller_id),
      buyerId: String(row.buyer_id),
      lastMessage: row.last_message ?? null,
      lastMessageAt: row.last_message_at ?? null,
      updatedAt: row.updated_at ?? null,
      product: row.product_id
        ? {
            id: String(row.product_id),
            title: row.product_title ?? 'Untitled',
            price: productPrice,
            currency: row.product_currency ?? 'IQD',
            imagePaths: previewImagePaths,
            imageUrls: [],
          }
        : null,
      seller: row.seller_id
        ? {
            id: String(row.seller_id),
            fullName: row.seller_full_name ?? null,
            avatarUrl: row.seller_avatar_url ?? null,
          }
        : null,
      buyer: row.buyer_id
        ? {
            id: String(row.buyer_id),
            fullName: row.buyer_full_name ?? null,
            avatarUrl: row.buyer_avatar_url ?? null,
          }
        : null,
    };

    return NextResponse.json({ conversation });
  },
  'messages-conversation-detail',
);
