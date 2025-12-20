'use client';
import { sendMessageSchema, type SendMessageInput } from '@/lib/validation/schemas';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env-public';
import { signStoragePaths } from '@/lib/services/storage-sign-client';

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
  hasUnread?: boolean;
  unreadCount?: number;
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
    const map = await signStoragePaths(paths, {
      transform: { width: 96, resize: 'cover', quality: 70, format: 'webp' },
    });

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
  const response = await fetch('/api/messages/conversations/create-or-get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerId, buyerId, productId: productId ?? null }),
  });

  if (!response.ok) {
    throw new Error('Failed to open conversation');
  }

  const payload = (await response.json()) as { id: string };
  return payload.id;
}

export async function fetchConversation(conversationId: string): Promise<ConversationSummary | null> {
  const response = await fetch(`/api/messages/conversations/${conversationId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to load conversation');
  }

  const payload = (await response.json()) as { conversation: ConversationSummary | null };
  const conversation = payload.conversation;
  if (conversation) {
    await hydrateConversationImages([conversation]);
  }
  return conversation;
}

export async function listConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  try {
    const response = await fetch(`/api/messages/conversations?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      // Log and fall back to an empty list so the UI can still open.
      const body = await response.text().catch(() => '');
      console.error('Failed to load conversations', response.status, body);
      return [];
    }

    const payload = (await response.json()) as { conversations: ConversationSummary[] };
    const conversations = payload.conversations ?? [];
    await hydrateConversationImages(conversations);
    return conversations;
  } catch (error) {
    console.error('Failed to load conversations', error);
    return [];
  }
}

export async function fetchMessages(
  conversationId: string,
  options?: { limit?: number; before?: string },
): Promise<MessageRecord[]> {
  const search = new URLSearchParams();
  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    search.set('limit', String(options.limit));
  }
  if (options?.before) {
    search.set('before', options.before);
  }
  const params = search.toString();
  const response = await fetch(
    `/api/messages/conversations/${conversationId}/messages${params ? `?${params}` : ''}`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to load messages');
  }

  const payload = (await response.json()) as { messages: MessageRecord[] };
  return payload.messages ?? [];
}

export async function sendMessage(options: SendMessageInput): Promise<MessageRecord> {
  const parsed = sendMessageSchema.parse(options);

  const response = await fetch('/api/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  const payload = (await response.json()) as { message: MessageRecord };
  return payload.message;
}

export async function markConversationRead(conversationId: string, userId: string) {
  const response = await fetch(`/api/messages/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw new Error('Failed to mark conversation as read');
  }
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const response = await fetch(`/api/messages/unread-count?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to load unread count');
  }

  const payload = (await response.json()) as { count: number };
  return payload.count ?? 0;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/messages/conversations/${conversationId}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Failed to delete conversation', response.status, body);
    throw new Error('Failed to delete conversation');
  }
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
