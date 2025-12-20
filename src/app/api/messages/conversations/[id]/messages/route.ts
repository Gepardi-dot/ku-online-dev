import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const GET = withSentryRoute(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
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

    // Use the service-role client for conversation lookups and message reads so the inbox
    // works even if conversation RLS policies block selects for participants.
    const { data: convo, error: convoError } = await supabaseAdmin
      .from('conversations')
      .select('id, seller_id, buyer_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convoError) {
      console.error('Conversation lookup failed for message history', {
        code: convoError.code,
        message: convoError.message,
        details: convoError.details,
      });
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
    }

    if (!convo || (convo.seller_id !== user.id && convo.buyer_id !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 10), 200) : 50;
    const before = searchParams.get('before');

    let query = supabaseAdmin
      .from('messages')
      .select('id, conversation_id, sender_id, receiver_id, product_id, content, is_read, created_at')
      .eq('conversation_id', conversationId);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

    if (error) {
      console.error('Messages history query failed', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    const messages = (data ?? [])
      .map((row) => ({
        id: String(row.id),
        conversationId: String(row.conversation_id),
        senderId: row.sender_id ? String(row.sender_id) : null,
        receiverId: row.receiver_id ? String(row.receiver_id) : null,
        productId: row.product_id ? String(row.product_id) : null,
        content: (row.content as string) ?? '',
        isRead: Boolean(row.is_read),
        createdAt: String(row.created_at),
      }))
      .reverse(); // ensure chronological order in UI

    return NextResponse.json({ messages });
  },
  'messages-conversation-messages',
);
