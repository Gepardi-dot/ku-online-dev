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

type LegacyRow = {
  id: string;
  product_id: string | null;
  seller_id: string;
  buyer_id: string;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  product?: any | null;
  seller?: any | null;
  buyer?: any | null;
};

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

function mapLegacyRows(rows: LegacyRow[], unreadCounts: Map<string, number>) {
  return rows.map((row) => {
    const productRecord = Array.isArray(row.product) ? row.product[0] : row.product;
    const rawImages = productRecord ? ((productRecord.images as unknown) ?? []) : [];
    const previewImagePaths = Array.isArray(rawImages)
      ? rawImages.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 1)
      : [];

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
            price: typeof productRecord.price === 'number' ? productRecord.price : Number(productRecord.price ?? null),
            currency: (productRecord.currency as string) ?? 'IQD',
            imagePaths: previewImagePaths,
            imageUrls: [],
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
}

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

function isRpcMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('schema cache') && message.includes('list_conversation_summaries');
}

function isRpcIncompatible(error: { code?: string; message?: string; details?: string } | null | undefined) {
  if (!error) return false;
  const code = (error.code ?? '').toLowerCase();
  const message = (error.message ?? '').toLowerCase();
  const details = (error.details ?? '').toLowerCase();
  return (
    code === '42804' &&
    message.includes('structure of query does not match function result type') &&
    details.includes('returned type')
  );
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
  const { data, error } = await supabaseAdmin.rpc('list_conversation_summaries', { p_user_id: user.id });
  const conversationsMs = TIMING_ENABLED ? performance.now() - conversationsStart : 0;

  const shouldFallbackToLegacy = Boolean(error && (isRpcMissing(error) || isRpcIncompatible(error)));

  if (error && !shouldFallbackToLegacy) {
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
        source: 'rpc',
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

  let source: 'rpc' | 'legacy' = 'rpc';
  let unreadMs = 0;
  let rows: LegacyRow[] | RpcRow[] = [];

  if (shouldFallbackToLegacy) {
    if (error) {
      console.warn('Falling back to legacy conversations query', {
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
      });
    }
    source = 'legacy';
    const legacyStart = TIMING_ENABLED ? performance.now() : 0;
    const legacyResult = await supabaseAdmin
      .from('conversations')
      .select(
        `id, product_id, seller_id, buyer_id, last_message, last_message_at, updated_at,
         product:products(id, title, price, currency, images),
         seller:public_user_profiles!conversations_seller_id_fkey(id, full_name, avatar_url),
         buyer:public_user_profiles!conversations_buyer_id_fkey(id, full_name, avatar_url)`,
      )
      .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
      .order('updated_at', { ascending: false, nullsFirst: false });
    const legacyMs = TIMING_ENABLED ? performance.now() - legacyStart : 0;

    if (legacyResult.error) {
      console.error('Conversations query failed', {
        code: legacyResult.error.code,
        message: legacyResult.error.message,
        details: legacyResult.error.details,
        hint: legacyResult.error.hint,
      });
      if (TIMING_ENABLED) {
        console.info('[chat-timing] conversations:route', {
          ms: Math.round(performance.now() - requestStart),
          status: 500,
          conversationsMs: Math.round(legacyMs),
          source: 'legacy',
        });
      }
      return NextResponse.json(
        {
          error: 'Failed to load conversations',
          code: legacyResult.error.code ?? null,
          message: legacyResult.error.message ?? null,
          details: legacyResult.error.details ?? null,
        },
        { status: 500 },
      );
    }

    rows = (legacyResult.data ?? []) as LegacyRow[];

    const unreadCounts = new Map<string, number>();
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

    const conversations = mapLegacyRows(rows as LegacyRow[], unreadCounts);

    const headers = new Headers();
    if (TIMING_ENABLED) {
      console.info('[chat-timing] conversations:route', {
        ms: Math.round(performance.now() - requestStart),
        status: 200,
        conversations: rows.length,
        conversationsMs: Math.round(legacyMs),
        unreadMs: Math.round(unreadMs),
        source,
      });
      const timing = buildServerTiming(
        [
          ['conversations', legacyMs],
          ['unread', unreadMs],
        ],
        source,
      );
      if (timing) headers.set('Server-Timing', timing);
    }
    return NextResponse.json({ conversations }, { headers });
  }

  rows = (data ?? []) as RpcRow[];
  const conversations = mapRpcRows(rows as RpcRow[]);

  const headers = new Headers();
  if (TIMING_ENABLED) {
    console.info('[chat-timing] conversations:route', {
      ms: Math.round(performance.now() - requestStart),
      status: 200,
      conversations: rows.length,
      conversationsMs: Math.round(conversationsMs),
      source,
    });
    const timing = buildServerTiming([['conversations', conversationsMs]], source);
    if (timing) headers.set('Server-Timing', timing);
  }
  return NextResponse.json({ conversations }, { headers });
}, 'messages-conversation-list');
