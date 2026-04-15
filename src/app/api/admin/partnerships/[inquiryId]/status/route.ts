import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';
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

const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const STATUS_SCHEMA = z.object({
  status: z.enum(['new', 'reviewed', 'closed']),
});

const INQUIRY_ID_SCHEMA = z.string().uuid();
const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;

export const PATCH = withSentryRoute(async (request: Request, ctx: { params: Promise<{ inquiryId: string }> }) => {
  if (!supabaseServiceRole) {
    return NextResponse.json({ ok: false, error: 'Service role is not configured.' }, { status: 500 });
  }

  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-partnerships:status:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ ok: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const userRate = checkRateLimit(`admin-partnerships:status:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const inquiryIdResult = INQUIRY_ID_SCHEMA.safeParse((await ctx.params).inquiryId);
  if (!inquiryIdResult.success) {
    return NextResponse.json({ ok: false, error: 'Invalid inquiry id.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = STATUS_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload.' }, { status: 400 });
  }

  const { data, error } = await supabaseServiceRole
    .from('partnership_inquiries')
    .update({ status: parsed.data.status })
    .eq('id', inquiryIdResult.data)
    .select('id, status')
    .single();

  if (error || !data?.id) {
    console.error('Failed to update partnership inquiry status', error);
    return NextResponse.json({ ok: false, error: 'Failed to update inquiry status.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    inquiry: {
      id: data.id,
      status: typeof data.status === 'string' ? data.status : parsed.data.status,
    },
  });
}, 'admin-partnership-status-update');
