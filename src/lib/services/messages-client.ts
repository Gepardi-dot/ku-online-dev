'use client';
import { sendMessageSchema, type SendMessageInput } from '@/lib/validation/schemas';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env-public';
import { chatTimingNow, isChatTimingEnabled, logChatTiming } from '@/lib/services/chat-timing';
import { signStoragePaths } from '@/lib/services/storage-sign-client';

const supabase = createClient();
const { NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET } = getPublicEnv();
const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const CONVERSATION_CACHE_TTL_MS = 60_000;
const CONVERSATION_CACHE_KEY = 'chat:conversations:';

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

type ConversationCacheEntry = {
  data: ConversationSummary[];
  cachedAt: number;
  expiresAt: number;
};

const conversationCache = new Map<string, ConversationCacheEntry>();
const conversationInFlight = new Map<string, Promise<ConversationSummary[]>>();

function normalizeTtl(ttlMs?: number): number {
  if (!ttlMs || !Number.isFinite(ttlMs)) {
    return CONVERSATION_CACHE_TTL_MS;
  }
  return Math.min(Math.max(ttlMs, 5_000), 5 * 60_000);
}

function getConversationCacheKey(userId: string): string {
  return `${CONVERSATION_CACHE_KEY}${userId}`;
}

function readSessionEntry(userId: string): ConversationCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(getConversationCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConversationCacheEntry | null;
    if (!parsed || !Array.isArray(parsed.data)) return null;
    if (typeof parsed.expiresAt !== 'number' || typeof parsed.cachedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionEntry(userId: string, entry: ConversationCacheEntry) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(getConversationCacheKey(userId), JSON.stringify(entry));
  } catch {
    // ignore storage write failures
  }
}

export function getCachedConversations(userId: string, ttlMs?: number): ConversationSummary[] | null {
  const timingEnabled = isChatTimingEnabled();
  const now = Date.now();
  const normalizedTtl = normalizeTtl(ttlMs);

  const inMemory = conversationCache.get(userId);
  if (inMemory && inMemory.expiresAt > now) {
    if (timingEnabled) {
      logChatTiming('conversations:cache', 0, {
        source: 'memory',
        count: inMemory.data.length,
        ageMs: now - inMemory.cachedAt,
      });
    }
    return inMemory.data;
  }

  const sessionEntry = readSessionEntry(userId);
  if (sessionEntry && sessionEntry.expiresAt > now) {
    conversationCache.set(userId, sessionEntry);
    if (timingEnabled) {
      logChatTiming('conversations:cache', 0, {
        source: 'session',
        count: sessionEntry.data.length,
        ageMs: now - sessionEntry.cachedAt,
      });
    }
    return sessionEntry.data;
  }

  if (inMemory && inMemory.expiresAt <= now) {
    conversationCache.delete(userId);
  }
  if (sessionEntry && sessionEntry.expiresAt <= now && typeof window !== 'undefined') {
    try {
      window.sessionStorage?.removeItem(getConversationCacheKey(userId));
    } catch {
      // ignore
    }
  }

  if (timingEnabled) {
    logChatTiming('conversations:cache-miss', 0, { ttlMs: normalizedTtl });
  }
  return null;
}

function setCachedConversations(userId: string, data: ConversationSummary[], ttlMs?: number) {
  const ttl = normalizeTtl(ttlMs);
  const now = Date.now();
  const entry = {
    data,
    cachedAt: now,
    expiresAt: now + ttl,
  };
  conversationCache.set(userId, entry);
  writeSessionEntry(userId, entry);
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
  const timingEnabled = isChatTimingEnabled();
  const startedAt = timingEnabled ? chatTimingNow() : 0;
  const paths = Array.from(
    new Set(
      conversations.flatMap((conversation) => {
        const images = conversation.product?.imagePaths ?? [];
        return images.slice(0, 1);
      }),
    ),
  ).filter(Boolean);

  if (!paths.length) {
    if (timingEnabled) {
      logChatTiming('images:sign:skip', chatTimingNow() - startedAt, { paths: 0 });
    }
    return;
  }

  try {
    const map = await signStoragePaths(paths, {
      transform: { width: 96, resize: 'cover', quality: 70, format: 'webp' },
    });

    conversations.forEach((conversation) => {
      if (!conversation.product) return;
      const urls = conversation.product.imagePaths
        .slice(0, 1)
        .map((path) => map[path])
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
      conversation.product.imageUrls = urls;
    });
    if (timingEnabled) {
      logChatTiming('images:sign', chatTimingNow() - startedAt, {
        paths: paths.length,
        signed: Object.keys(map).length,
      });
    }
  } catch (error) {
    console.error('Failed to hydrate conversation images', error);
    if (timingEnabled) {
      logChatTiming('images:sign:error', chatTimingNow() - startedAt, { paths: paths.length });
    }
  }
}

async function fetchConversationsFromApi(userId: string): Promise<ConversationSummary[]> {
  const timingEnabled = isChatTimingEnabled();
  const fetchStart = timingEnabled ? chatTimingNow() : 0;
  const response = await fetch(`/api/messages/conversations?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
  });

  if (timingEnabled) {
    logChatTiming('conversations:fetch', chatTimingNow() - fetchStart, {
      status: response.status,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Failed to load conversations', response.status, body);
    return [];
  }

  const parseStart = timingEnabled ? chatTimingNow() : 0;
  const payload = (await response.json()) as { conversations: ConversationSummary[] };
  if (timingEnabled) {
    logChatTiming('conversations:parse', chatTimingNow() - parseStart);
  }

  const conversations = payload.conversations ?? [];
  await hydrateConversationImages(conversations);
  return conversations;
}

async function refreshConversations(userId: string, ttlMs?: number): Promise<ConversationSummary[]> {
  const existing = conversationInFlight.get(userId);
  if (existing) {
    return existing;
  }

  const timingEnabled = isChatTimingEnabled();
  const totalStart = timingEnabled ? chatTimingNow() : 0;

  const promise = (async () => {
    try {
      const conversations = await fetchConversationsFromApi(userId);
      setCachedConversations(userId, conversations, ttlMs);
      if (timingEnabled) {
        logChatTiming('conversations:total', chatTimingNow() - totalStart, {
          count: conversations.length,
          cached: true,
        });
      }
      return conversations;
    } catch (error) {
      console.error('Failed to load conversations', error);
      if (timingEnabled) {
        logChatTiming('conversations:error', chatTimingNow() - totalStart);
      }
      return [];
    }
  })().finally(() => {
    conversationInFlight.delete(userId);
  });

  conversationInFlight.set(userId, promise);
  return promise;
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
  const timingEnabled = isChatTimingEnabled();
  const totalStart = timingEnabled ? chatTimingNow() : 0;
  const fetchStart = timingEnabled ? chatTimingNow() : 0;
  const response = await fetch(`/api/messages/conversations/${conversationId}`, {
    method: 'GET',
  });

  if (timingEnabled) {
    logChatTiming('conversation:fetch', chatTimingNow() - fetchStart, {
      status: response.status,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to load conversation');
  }

  const parseStart = timingEnabled ? chatTimingNow() : 0;
  const payload = (await response.json()) as { conversation: ConversationSummary | null };
  if (timingEnabled) {
    logChatTiming('conversation:parse', chatTimingNow() - parseStart);
  }
  const conversation = payload.conversation;
  if (conversation) {
    await hydrateConversationImages([conversation]);
  }
  if (timingEnabled) {
    logChatTiming('conversation:total', chatTimingNow() - totalStart, {
      hasConversation: Boolean(conversation),
    });
  }
  return conversation;
}

export async function listConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  return listConversationsForUserWithOptions(userId, { preferCache: false });
}

export async function listConversationsForUserWithOptions(
  userId: string,
  options?: { preferCache?: boolean; backgroundRefresh?: boolean; cacheTtlMs?: number },
): Promise<ConversationSummary[]> {
  const ttlMs = normalizeTtl(options?.cacheTtlMs);
  const preferCache = options?.preferCache !== false;
  const cached = preferCache ? getCachedConversations(userId, ttlMs) : null;

  if (cached && options?.backgroundRefresh) {
    void refreshConversations(userId, ttlMs);
    return cached;
  }

  const fresh = await refreshConversations(userId, ttlMs);
  if (fresh.length === 0 && cached) {
    return cached;
  }
  return fresh;
}

export function prefetchConversationsForUser(userId: string, ttlMs?: number) {
  const cached = getCachedConversations(userId, ttlMs);
  if (cached) return;
  void refreshConversations(userId, ttlMs);
}

export async function fetchMessages(
  conversationId: string,
  options?: { limit?: number; before?: string },
): Promise<MessageRecord[]> {
  const timingEnabled = isChatTimingEnabled();
  const totalStart = timingEnabled ? chatTimingNow() : 0;
  const search = new URLSearchParams();
  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    search.set('limit', String(options.limit));
  }
  if (options?.before) {
    search.set('before', options.before);
  }
  const params = search.toString();
  const fetchStart = timingEnabled ? chatTimingNow() : 0;
  const response = await fetch(
    `/api/messages/conversations/${conversationId}/messages${params ? `?${params}` : ''}`,
    {
      method: 'GET',
    },
  );

  if (timingEnabled) {
    logChatTiming('messages:fetch', chatTimingNow() - fetchStart, {
      status: response.status,
      hasBefore: Boolean(options?.before),
    });
  }
  if (!response.ok) {
    throw new Error('Failed to load messages');
  }

  const parseStart = timingEnabled ? chatTimingNow() : 0;
  const payload = (await response.json()) as { messages: MessageRecord[] };
  if (timingEnabled) {
    logChatTiming('messages:parse', chatTimingNow() - parseStart, {
      count: payload.messages?.length ?? 0,
    });
    logChatTiming('messages:total', chatTimingNow() - totalStart, {
      count: payload.messages?.length ?? 0,
    });
  }
  return payload.messages ?? [];
}

export async function sendMessage(options: SendMessageInput): Promise<MessageRecord> {
  const parsed = sendMessageSchema.parse(options);

  const response = await fetch('/api/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });

  const bodyText = await response.text().catch(() => '');
  let payload: { message?: MessageRecord; error?: string } | null = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText) as { message?: MessageRecord; error?: string };
    } catch {
      payload = null;
    }
  }

  if (!response.ok || !payload?.message) {
    const errorMessage =
      typeof payload?.error === 'string'
        ? payload.error
        : `Failed to send message${response.status ? ` (${response.status})` : ''}`;
    throw new Error(errorMessage);
  }

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
