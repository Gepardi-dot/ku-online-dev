import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

export const runtime = 'nodejs';

const env = getEnv();
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const RATE_LIMIT_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_USER = { windowMs: 60_000, max: 20 } as const;

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`avatar:ip:${clientIdentifier}`, RATE_LIMIT_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many avatar updates. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Invalid avatar URL' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`avatar:user:${user.id}`, RATE_LIMIT_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Avatar update limit reached. Please try again shortly.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to save avatar' }, { status: 500 });
  }

  // Best-effort: update auth metadata too
  try {
    await supabase.auth.updateUser({ data: { avatar_url: url } });
  } catch {}

  return NextResponse.json({ ok: true });
});
