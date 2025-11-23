import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();

const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const BLOCK_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const BLOCK_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 30 } as const;

type BlockBody = {
  blockedUserId?: string;
  reason?: string;
};

const postHandler: (request: Request) => Promise<Response> = async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`block-user:ip:${clientIdentifier}`, BLOCK_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json(
        { error: 'Too many block actions from this network. Please wait a moment.' },
        { status: 429 },
      );
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as BlockBody;
  const blockedUserId = body.blockedUserId;
  const reason = (body.reason ?? '').trim() || null;

  if (!blockedUserId) {
    return NextResponse.json({ error: 'blockedUserId is required.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (user.id === blockedUserId) {
    return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 400 });
  }

  const userRate = checkRateLimit(`block-user:user:${user.id}`, BLOCK_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json(
      { error: 'You have reached the block/unblock rate limit. Please try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const { error } = await supabase
    .from('blocked_users')
    .upsert(
      {
        user_id: user.id,
        blocked_user_id: blockedUserId,
        reason,
      },
      { onConflict: 'user_id,blocked_user_id' },
    );

  if (error) {
    console.error('Failed to block user', error);
    return NextResponse.json({ error: 'Failed to block user.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
};

const deleteHandler: (request: Request) => Promise<Response> = async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`block-user:ip:${clientIdentifier}`, BLOCK_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json(
        { error: 'Too many block actions from this network. Please wait a moment.' },
        { status: 429 },
      );
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as BlockBody;
  const blockedUserId = body.blockedUserId;
  if (!blockedUserId) {
    return NextResponse.json({ error: 'blockedUserId is required.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`block-user:user:${user.id}`, BLOCK_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json(
      { error: 'You have reached the block/unblock rate limit. Please try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('user_id', user.id)
    .eq('blocked_user_id', blockedUserId);

  if (error) {
    console.error('Failed to unblock user', error);
    return NextResponse.json({ error: 'Failed to unblock user.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
};

export const POST = withSentryRoute(postHandler, 'abuse-block-post');

export const DELETE = withSentryRoute(deleteHandler, 'abuse-block-delete');
