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

const RATE_LIMIT_IP = { windowMs: 60_000, max: 20 } as const;
const RATE_LIMIT_USER = { windowMs: 60_000, max: 10 } as const;

type PhoneLinkRequest = {
  action?: 'request' | 'verify';
  phone?: string;
  token?: string;
};

function normalizePhone(value: string): string {
  return value.trim().replace(/[\s()-]/g, '');
}

function isPhoneValid(value: string): boolean {
  return /^(?:\+|00)?[0-9]{7,15}$/.test(value);
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`phone-link:ip:${clientIdentifier}`, RATE_LIMIT_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as PhoneLinkRequest;
  const action = body.action;
  const phoneRaw = typeof body.phone === 'string' ? body.phone : '';
  const phone = normalizePhone(phoneRaw);

  if (!action || (action !== 'request' && action !== 'verify')) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  if (!phone || !isPhoneValid(phone)) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
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

  const userRate = checkRateLimit(`phone-link:user:${user.id}`, RATE_LIMIT_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  if (action === 'request') {
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) {
      return NextResponse.json({ error: error.message ?? 'Unable to send verification code.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!/^[0-9]{6}$/.test(token)) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'phone_change',
  });
  if (verifyError) {
    return NextResponse.json({ error: verifyError.message ?? 'Invalid or expired code.' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ phone, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (updateError) {
    return NextResponse.json({ error: 'Failed to save phone number.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
