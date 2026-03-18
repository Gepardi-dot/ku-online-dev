import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

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

    const { error } = await supabase.rpc('delete_message_secure', {
      p_message_id: messageId,
    });

    if (error) {
      const code = (error.code ?? '').toUpperCase();
      const message = (error.message ?? '').toLowerCase();
      if (code === '28000' || message.includes('not_authenticated')) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (code === '42501' || message.includes('forbidden')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (code === 'P0002' || message.includes('message_not_found')) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }
      if (code === '22P02' || message.includes('invalid input syntax for type uuid')) {
        return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });
      }
      console.error('Failed to delete message', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  },
  'messages-delete',
);
