import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export const GET = withSentryRoute(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (userId && userId !== user.id)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { count, error } = await supabase
    .from('messages')
    .select('id', { head: true, count: 'exact' })
    .eq('receiver_id', user.id)
    .eq('is_read', false);

  if (error) {
    return NextResponse.json({ error: 'Failed to load unread count' }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}, 'messages-unread-count');

