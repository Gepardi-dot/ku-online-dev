import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TIMING_ENABLED = process.env.CHAT_TIMINGS === '1';

export const GET = withSentryRoute(async (request: Request) => {
  const requestStart = TIMING_ENABLED ? performance.now() : 0;
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

  const conversationsStart = TIMING_ENABLED ? performance.now() : 0;
  const { data, error } = await supabaseAdmin.rpc('list_conversation_summaries', { p_user_id: user.id });
  const conversationsMs = TIMING_ENABLED ? performance.now() - conversationsStart : 0;

  if (error) {
    console.error('Conversations query failed', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (TIMING_ENABLED) {
      console.info('[chat-timing] conversations:route', {
        ms: Math.round(performance.now() - requestStart),
        status: 500,
        conversationsMs: Math.round(conversationsMs),
      });
    }
    return NextResponse.json(
      {
        error: 'Failed to load conversations',
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
      },
      { status: 500 },
    );
  }

  const rows = data ?? [];

  const conversations = rows.map((row: any) => {
    const productImage = typeof row.product_image === 'string' ? row.product_image : null;
    const imagePaths = productImage && productImage.trim().length > 0 ? [productImage] : [];
    const priceValue =
      typeof row.product_price === 'number'
        ? row.product_price
        : row.product_price
        ? Number(row.product_price)
        : null;
    const unreadCount = Number(row.unread_count ?? 0);

    return {
      id: String(row.id),
      productId: row.product_id ? String(row.product_id) : null,
      sellerId: String(row.seller_id),
      buyerId: String(row.buyer_id),
      lastMessage: (row.last_message as string | null) ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      unreadCount,
      hasUnread: unreadCount > 0,
      product: row.product_id
        ? {
            id: String(row.product_id),
            title: (row.product_title as string | null) ?? 'Untitled',
            price: priceValue,
            currency: (row.product_currency as string | null) ?? 'IQD',
            imagePaths,
            imageUrls: [],
          }
        : null,
      seller: row.seller_id
        ? {
            id: String(row.seller_id),
            fullName: (row.seller_full_name as string | null) ?? null,
            avatarUrl: (row.seller_avatar_url as string | null) ?? null,
          }
        : null,
      buyer: row.buyer_id
        ? {
            id: String(row.buyer_id),
            fullName: (row.buyer_full_name as string | null) ?? null,
            avatarUrl: (row.buyer_avatar_url as string | null) ?? null,
          }
        : null,
    };
  });

  if (TIMING_ENABLED) {
    console.info('[chat-timing] conversations:route', {
      ms: Math.round(performance.now() - requestStart),
      status: 200,
      conversations: rows.length,
      conversationsMs: Math.round(conversationsMs),
    });
  }
  return NextResponse.json({ conversations });
}, 'messages-conversation-list');
