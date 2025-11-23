import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export const POST = withSentryRoute(async (request: Request, context: { params: { id: string } }) => {
  const conversationId = context.params.id;
  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (userId && userId !== user.id)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .eq('receiver_id', user.id)
    .eq('is_read', false);

  if (error) {
    return NextResponse.json({ error: 'Failed to mark conversation read' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}, 'messages-conversation-read');

