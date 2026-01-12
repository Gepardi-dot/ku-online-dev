import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const DELETE = withSentryRoute(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id: messageId } = await context.params;

    if (!messageId) {
      return NextResponse.json({ error: 'Missing message id' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = await createServerClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Load the message with elevated rights so we can safely recompute the conversation summary.
    const { data: messageRow, error: messageError } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id, sender_id')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError) {
      console.error('Failed to load message for delete', {
        code: messageError.code,
        message: messageError.message,
        details: messageError.details,
      });
      return NextResponse.json({ error: 'Failed to load message' }, { status: 500 });
    }

    if (!messageRow) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (messageRow.sender_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete via the authed client so RLS is still enforced.
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) {
      console.error('Failed to delete message', {
        code: deleteError.code,
        message: deleteError.message,
        details: deleteError.details,
      });
      return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
    }

    // Best-effort: recompute conversation last_message / last_message_at so the summary stays in sync.
    try {
      const { data: latest, error: latestError } = await supabaseAdmin
        .from('messages')
        .select('content, created_at')
        .eq('conversation_id', messageRow.conversation_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        throw latestError;
      }

      const payload = latest
        ? {
            last_message: (latest.content as string | null) ?? null,
            last_message_at: latest.created_at as string | null,
          }
        : {
            last_message: null,
            last_message_at: null,
          };

      const { error: updateError } = await supabaseAdmin
        .from('conversations')
        .update(payload)
        .eq('id', messageRow.conversation_id);

      if (updateError) {
        console.error('Failed to update conversation after message delete', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
        });
      }
    } catch (error) {
      console.error('Failed to recompute conversation summary after delete', error);
    }

    return NextResponse.json({ ok: true });
  },
  'messages-delete',
);

