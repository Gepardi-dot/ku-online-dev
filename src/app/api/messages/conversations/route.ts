import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { performance } from 'node:perf_hooks';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const TIMING_ENABLED = process.env.CHAT_TIMINGS === '1';

type RpcRow = {
  id: string;
  product_id: string | null;
  seller_id: string;
  buyer_id: string;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  unread_count: number | null;
  product_title: string | null;
  product_price: number | string | null;
  product_currency: string | null;
  product_image: string | null;
  seller_full_name: string | null;
  seller_avatar_url: string | null;
  buyer_full_name: string | null;
  buyer_avatar_url: string | null;
};

function mapRpcRows(rows: RpcRow[]) {
  return rows.map((row) => {
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
}

function buildServerTiming(parts: Array<[string, number | null | undefined]>, source?: string) {
  const segments = parts
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([label, value]) => `${label};dur=${Math.max(0, Math.round(value as number))}`);
  if (source) {
    segments.push(`source;desc="${source}"`);
  }
  return segments.join(', ');
}

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
  const { data, error } = await supabase.rpc('list_conversation_summaries_secure');
  const conversationsMs = TIMING_ENABLED ? performance.now() - conversationsStart : 0;

  if (error) {
    const code = (error.code ?? '').toUpperCase();
    const message = (error.message ?? '').toLowerCase();
    if (code === '28000' || message.includes('not_authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (code === '42501' || message.includes('forbidden')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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
        source: 'secure_rpc',
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

  const rows = (data ?? []) as RpcRow[];
  const conversations = mapRpcRows(rows);

  const headers = new Headers();
  if (TIMING_ENABLED) {
    console.info('[chat-timing] conversations:route', {
      ms: Math.round(performance.now() - requestStart),
      status: 200,
      conversations: rows.length,
      conversationsMs: Math.round(conversationsMs),
      source: 'secure_rpc',
    });
    const timing = buildServerTiming([['conversations', conversationsMs]], 'secure_rpc');
    if (timing) headers.set('Server-Timing', timing);
  }
  return NextResponse.json({ conversations }, { headers });
}, 'messages-conversation-list');
