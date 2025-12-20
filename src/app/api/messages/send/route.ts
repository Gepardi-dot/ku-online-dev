import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const schema = z.object({
  conversationId: z.string().uuid().optional(),
  receiverId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1).max(1000),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 40 } as const;

const handler: (request: Request) => Promise<Response> = async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const rate = checkRateLimit(`messages:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!rate.success) {
      const res = NextResponse.json({ error: 'Too many requests from this network. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, rate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const { conversationId: incomingConv, receiverId, productId, content } = parsed.data;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`messages:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Message rate limit reached. Please try again shortly.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  // Prevent messaging if either party has blocked the other.
  const { data: blockRows, error: blockError } = await supabase
    .from('blocked_users')
    .select('id')
    .or(`and(user_id.eq.${user.id},blocked_user_id.eq.${receiverId}),and(user_id.eq.${receiverId},blocked_user_id.eq.${user.id})`)
    .limit(1);

  if (blockError) {
    const code = (blockError as { code?: string }).code;
    const message = (blockError as { message?: string }).message ?? '';
    const missingTable = code === '42P01' || message.toLowerCase().includes('blocked_users');
    if (missingTable) {
      console.warn('blocked_users table missing; skipping block check.');
    } else {
      console.error('Failed to check blocked users', {
        code: (blockError as { code?: string }).code,
        message: (blockError as { message?: string }).message,
        details: (blockError as { details?: string | null }).details,
        hint: (blockError as { hint?: string | null }).hint,
      });
      return NextResponse.json({ error: 'Unable to send message right now.' }, { status: 503 });
    }
  } else if (blockRows && blockRows.length > 0) {
    return NextResponse.json(
      { error: 'Messages cannot be sent because one of you has blocked the other.' },
      { status: 403 },
    );
  }

  // Lightweight spam checks before writing to the database.
  const lowerContent = content.toLowerCase();
  const linkMatches = lowerContent.match(/https?:\/\/|www\./g) ?? [];
  if (linkMatches.length > 5) {
    return NextResponse.json(
      { error: 'Messages with that many links are not allowed.' },
      { status: 400 },
    );
  }

  const repeatedCharsMatch = lowerContent.match(/(.)\1{10,}/);
  if (repeatedCharsMatch) {
    return NextResponse.json(
      { error: 'Message looks like spam (too many repeated characters).' },
      { status: 400 },
    );
  }

  const spamPhrases = ['make money fast', 'free crypto', 'visit my channel', 'whatsapp me on', 'telegram me on'];
  if (spamPhrases.some((phrase) => lowerContent.includes(phrase))) {
    return NextResponse.json(
      { error: 'Message was blocked because it looks like spam.' },
      { status: 400 },
    );
  }

  // Block obvious high-frequency duplicates from the same sender.
  const spamWindowStart = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: recentDuplicates, error: recentError } = await supabase
    .from('messages')
    .select('id')
    .eq('sender_id', user.id)
    .eq('content', content)
    .gte('created_at', spamWindowStart)
    .limit(5);

  if (!recentError && (recentDuplicates?.length ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'You have sent this message too many times in a short period.' },
      { status: 429 },
    );
  }

  let conversationId = incomingConv ?? null;
  if (!conversationId) {
    // Create or get conversation between sender (buyer) and receiver (seller)
    const { data: convId, error: convError } = await supabase.rpc('get_or_create_conversation', {
      p_seller_id: receiverId,
      p_buyer_id: user.id,
      p_product_id: productId ?? null,
    });
    if (convError || !convId) {
      return NextResponse.json({ error: 'Failed to open conversation' }, { status: 500 });
    }
    conversationId = String(convId);
  }

  const payload = {
    conversation_id: conversationId,
    sender_id: user.id,
    receiver_id: receiverId,
    product_id: productId ?? null,
    content,
  } as const;

  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('id, conversation_id, sender_id, receiver_id, product_id, content, is_read, created_at')
    .single();

  if (error || !data) {
    console.error('Failed to send message', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return NextResponse.json({ error: error?.message ?? 'Failed to send message' }, { status: 500 });
  }

  const message = {
    id: String(data.id),
    conversationId: String(data.conversation_id),
    senderId: String(data.sender_id),
    receiverId: String(data.receiver_id),
    productId: data.product_id ? String(data.product_id) : null,
    content: String(data.content ?? ''),
    isRead: Boolean(data.is_read),
    createdAt: String(data.created_at),
  };

  return NextResponse.json({ message });
};

export const POST = withSentryRoute(handler, 'messages-send');
