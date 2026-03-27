import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  receiver_id: string | null;
  product_id: string | null;
  content: string | null;
  is_read: boolean | null;
  created_at: string;
};

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

    const searchParams = new URL(request.url).searchParams;
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 10), 200) : 50;
    const before = searchParams.get('before');

    const { data, error } = await supabase.rpc('list_conversation_messages_secure', {
      p_conversation_id: conversationId,
      p_before: before,
      p_limit: limit,
    });

    if (error) {
      const code = (error.code ?? '').toUpperCase();
      const message = (error.message ?? '').toLowerCase();
      if (code === '42501' || message.includes('forbidden')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      console.error('Messages history query failed', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    const messages = ((data ?? []) as ConversationMessageRow[])
      .map((row: ConversationMessageRow) => ({
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
