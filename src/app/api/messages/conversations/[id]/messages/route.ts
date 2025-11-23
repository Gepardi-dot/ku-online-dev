import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export const GET = withSentryRoute(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
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

    const { data: convo, error: convoError } = await supabase
      .from('conversations')
      .select('id, seller_id, buyer_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convoError) {
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
    }

    if (!convo || (convo.seller_id !== user.id && convo.buyer_id !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, receiver_id, product_id, content, is_read, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    const messages = (data ?? []).map((row) => ({
      id: String(row.id),
      conversationId: String(row.conversation_id),
      senderId: row.sender_id ? String(row.sender_id) : null,
      receiverId: row.receiver_id ? String(row.receiver_id) : null,
      productId: row.product_id ? String(row.product_id) : null,
      content: (row.content as string) ?? '',
      isRead: Boolean(row.is_read),
      createdAt: String(row.created_at),
    }));

    return NextResponse.json({ messages });
  },
  'messages-conversation-messages',
);
