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
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select(
      `id, product_id, seller_id, buyer_id, last_message, last_message_at, updated_at,
       product:products(id, title, price, currency, images),
       seller:public_user_profiles!conversations_seller_id_fkey(id, full_name, avatar_url),
       buyer:public_user_profiles!conversations_buyer_id_fkey(id, full_name, avatar_url)`,
    )
    .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
    .order('updated_at', { ascending: false, nullsFirst: false });
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

  // Derive which conversations have unread messages for this user so
  // the UI can visually distinguish unread threads.
  const unreadCounts = new Map<string, number>();
  let unreadMs = 0;
  if (rows.length > 0) {
    const conversationIds = rows.map((row) => String(row.id));
    const unreadStart = TIMING_ENABLED ? performance.now() : 0;
    const { data: unreadRows, error: unreadError } = await supabaseAdmin
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('receiver_id', user.id)
      .eq('is_read', false);
    unreadMs = TIMING_ENABLED ? performance.now() - unreadStart : 0;

    if (unreadError) {
      console.error('Unread messages query failed', unreadError);
    } else {
      (unreadRows ?? []).forEach((row: any) => {
        const conversationId = String(row.conversation_id);
        unreadCounts.set(conversationId, (unreadCounts.get(conversationId) ?? 0) + 1);
      });
    }
  }

  const conversations = rows.map((row) => {
    const productRecord = Array.isArray(row.product) ? row.product[0] : row.product;

    return {
      id: String(row.id),
      productId: row.product_id ? String(row.product_id) : null,
      sellerId: String(row.seller_id),
      buyerId: String(row.buyer_id),
      lastMessage: (row.last_message as string | null) ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      unreadCount: unreadCounts.get(String(row.id)) ?? 0,
      hasUnread: (unreadCounts.get(String(row.id)) ?? 0) > 0,
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
    };
  });

  if (TIMING_ENABLED) {
    console.info('[chat-timing] conversations:route', {
      ms: Math.round(performance.now() - requestStart),
      status: 200,
      conversations: rows.length,
      conversationsMs: Math.round(conversationsMs),
      unreadMs: Math.round(unreadMs),
    });
  }
  return NextResponse.json({ conversations });
}, 'messages-conversation-list');
