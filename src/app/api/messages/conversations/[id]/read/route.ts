import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

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

    const { error } = await supabase.rpc('mark_conversation_read_secure', { p_conversation_id: conversationId });

    if (error) {
      const code = (error.code ?? '').toUpperCase();
      const message = (error.message ?? '').toLowerCase();
      if (code === '28000' || message.includes('not_authenticated')) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (code === '42501' || message.includes('forbidden')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      console.error('Failed to mark conversation read', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ error: 'Failed to mark conversation read' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  },
  'messages-conversation-read',
);
