'use client';

import { createClient } from '@/utils/supabase/client';
import { sendMessageSchema, type SendMessageInput } from '@/lib/validation/schemas';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env-public';

const supabase = createClient();
const { NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET } = getPublicEnv();
const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string | null;
  receiverId: string | null;
  productId: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  productId: string | null;
  sellerId: string;
  buyerId: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  updatedAt: string | null;
  product?: {
    id: string;
    title: string;
    price: number | null;
    currency: string | null;
    imagePaths: string[];
    imageUrls: string[];
  } | null;
  seller?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  buyer?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
}

function mapMessageRow(row: any): MessageRecord {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: (row.sender_id as string) ?? null,
    receiverId: (row.receiver_id as string) ?? null,
    productId: (row.product_id as string) ?? null,
    content: (row.content as string) ?? '',
    isRead: Boolean(row.is_read),
    createdAt: row.created_at as string,
  };
}

function mapConversationRow(row: any): ConversationSummary {
  const imagesValue = Array.isArray(row?.product?.images)
    ? row.product.images.filter((item: unknown): item is string => typeof item === 'string')
    : [];

  const priceValue =
    typeof row?.product?.price === 'number'
      ? row.product.price
      : row?.product?.price
      ? Number(row.product.price)
      : null;

  return {
    id: row.id as string,
    productId: (row.product_id as string) ?? null,
    sellerId: row.seller_id as string,
    buyerId: row.buyer_id as string,
    lastMessage: (row.last_message as string) ?? null,
    lastMessageAt: (row.last_message_at as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
    product: row.product
      ? {
          id: row.product.id as string,
          title: (row.product.title as string) ?? 'Untitled',
          price: priceValue,
          currency: (row.product.currency as string) ?? 'IQD',
          imagePaths: imagesValue,
          imageUrls: imagesValue,
        }
      : null,
    seller: row.seller
      ? {
          id: row.seller.id as string,
          fullName: (row.seller.full_name as string) ?? null,
          avatarUrl: (row.seller.avatar_url as string) ?? null,
        }
      : null,
    buyer: row.buyer
      ? {
          id: row.buyer.id as string,
          fullName: (row.buyer.full_name as string) ?? null,
          avatarUrl: (row.buyer.avatar_url as string) ?? null,
        }
      : null,
  };
}

async function hydrateConversationImages(conversations: ConversationSummary[]) {
  const paths = Array.from(
    new Set(conversations.flatMap((conversation) => conversation.product?.imagePaths ?? [])),
  ).filter(Boolean);

  if (!paths.length) {
    return;
  }

  try {
    const response = await fetch('/api/storage/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, transform: { width: 96, resize: 'cover', quality: 70, format: 'webp' } }),
    });
    if (!response.ok) {
      throw new Error('Failed to sign conversation images');
    }
    const payload = (await response.json().catch(() => ({}))) as { map?: Record<string, string> };
    const map = payload.map ?? {};

    conversations.forEach((conversation) => {
      if (!conversation.product) return;
      const urls = conversation.product.imagePaths
        .map((path) => map[path])
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
      conversation.product.imageUrls = urls;
    });
  } catch (error) {
    console.error('Failed to hydrate conversation images', error);
  }
}

export async function getOrCreateConversation(sellerId: string, buyerId: string, productId?: string | null) {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_seller_id: sellerId,
    p_buyer_id: buyerId,
    p_product_id: productId ?? null,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function fetchConversation(conversationId: string): Promise<ConversationSummary | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `id, product_id, seller_id, buyer_id, last_message, last_message_at, updated_at,
       product:products(id, title, price, currency, images),
       seller:users!conversations_seller_id_fkey(id, full_name, avatar_url),
       buyer:users!conversations_buyer_id_fkey(id, full_name, avatar_url)`
    )
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const conversation = data ? mapConversationRow(data) : null;
  if (conversation) {
    await hydrateConversationImages([conversation]);
  }
  return conversation;
}

export async function listConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `id, product_id, seller_id, buyer_id, last_message, last_message_at, updated_at,
       product:products(id, title, price, currency, images),
       seller:users!conversations_seller_id_fkey(id, full_name, avatar_url),
       buyer:users!conversations_buyer_id_fkey(id, full_name, avatar_url)`
    )
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .order('updated_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  const conversations = (data ?? []).map((row) => mapConversationRow(row));
  await hydrateConversationImages(conversations);
  return conversations;
}

export async function fetchMessages(conversationId: string): Promise<MessageRecord[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, receiver_id, product_id, content, is_read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapMessageRow(row));
}

export async function sendMessage(options: SendMessageInput): Promise<MessageRecord> {
  const parsed = sendMessageSchema.parse(options);

  const payload = {
    conversation_id: parsed.conversationId,
    sender_id: parsed.senderId,
    receiver_id: parsed.receiverId,
    product_id: parsed.productId ?? null,
    content: parsed.content,
  };

  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('id, conversation_id, sender_id, receiver_id, product_id, content, is_read, created_at')
    .single();

  if (error) {
    throw error;
  }

  return mapMessageRow(data);
}

export async function markConversationRead(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .eq('receiver_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { head: true, count: 'exact' })
    .eq('receiver_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export function subscribeToConversation(
  conversationId: string,
  handler: (message: MessageRecord) => void,
): RealtimeChannel {
  return supabase
    .channel(`conversation-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        handler(mapMessageRow(payload.new));
      },
    )
    .subscribe();
}

export function subscribeToIncomingMessages(
  userId: string,
  handler: (message: MessageRecord) => void,
): RealtimeChannel {
  return supabase
    .channel(`inbox-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        handler(mapMessageRow(payload.new));
      },
    )
    .subscribe();
}
