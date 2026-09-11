import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
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
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 40 } as const;
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'https://www.kubazar.net',
  'https://kubazar.net',
  'http://localhost:5000',
]);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ ok: false, error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const GET = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = await checkRateLimit(`admin-listing-draft-lookup:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests. Please wait a moment.');
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
  }

  const userRate = await checkRateLimit(`admin-listing-draft-lookup:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Too many requests. Please try again later.');
  }

  if (!supabaseServiceRole) {
    return NextResponse.json({ ok: false, error: 'Server is not configured.' }, { status: 500 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 3) {
    return NextResponse.json({ ok: false, error: 'Enter at least 3 characters.' }, { status: 400 });
  }

  let requestQuery = supabaseServiceRole
    .from('users')
    .select('id, email, phone, full_name, name')
    .limit(8);

  if (isUuid(query)) {
    requestQuery = requestQuery.eq('id', query);
  } else if (query.includes('@')) {
    requestQuery = requestQuery.ilike('email', `%${query}%`);
  } else {
    requestQuery = requestQuery.or(`phone.ilike.%${query}%,full_name.ilike.%${query}%,name.ilike.%${query}%`);
  }

  const { data, error } = await requestQuery;
  if (error) {
    console.error('Failed to look up sellers for listing draft', error);
    return NextResponse.json({ ok: false, error: 'Unable to search sellers.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sellers: data ?? [] });
});
