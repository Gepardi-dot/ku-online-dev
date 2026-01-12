import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST = withSentryRoute(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id: conversationId } = await context.params;
    const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversation id' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = await createServerClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || (userId && userId !== user.id)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: convo, error: convoError } = await supabaseAdmin
      .from('conversations')
      .select('id, seller_id, buyer_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convoError) {
      console.error('Conversation lookup failed for mark read', {
        code: convoError.code,
        message: convoError.message,
        details: convoError.details,
      });
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
    }

    if (!convo || (convo.seller_id !== user.id && convo.buyer_id !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', user.id)
      .eq('is_read', false);

    if (error) {
      return NextResponse.json({ error: 'Failed to mark conversation read' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  },
  'messages-conversation-read',
);
