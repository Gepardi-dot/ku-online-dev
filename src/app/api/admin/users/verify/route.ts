import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

type VerifyUserBody = {
  userId?: string;
  isVerified?: boolean;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const handler: (request: Request) => Promise<Response> = async (request: Request) => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!supabaseServiceRole) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as VerifyUserBody;
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const isVerified = body.isVerified === true ? true : body.isVerified === false ? false : null;

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  if (!isUuid(userId)) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
  }

  if (isVerified === null) {
    return NextResponse.json({ error: 'Missing isVerified' }, { status: 400 });
  }

  const { data, error } = await supabaseServiceRole
    .from('users')
    .update({ is_verified: isVerified })
    .eq('id', userId)
    .select('id, is_verified')
    .maybeSingle();

  if (error) {
    console.error('Failed to update user verification', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: { id: data.id, isVerified: Boolean(data.is_verified) } });
};

export const PATCH = withSentryRoute(handler, 'admin-user-verify');
