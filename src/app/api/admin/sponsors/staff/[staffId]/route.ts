import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const STAFF_ID_SCHEMA = z.string().uuid();

const UPDATE_SCHEMA = z.object({
  role: z.enum(['manager', 'cashier']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 360 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 360 } as const;

export const PATCH = withSentryRoute(async (request: Request, ctx: { params: Promise<{ staffId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-staff:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawStaffId = (await ctx.params).staffId;
  const parsedStaffId = STAFF_ID_SCHEMA.safeParse(rawStaffId);
  if (!parsedStaffId.success) {
    return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isModerator(user)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const userRate = checkRateLimit(`admin-sponsor-staff:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;

  const { data, error } = await supabase.from('sponsor_store_staff').update(update).eq('id', parsedStaffId.data).select('id').single();
  if (error) {
    console.error('Failed to update sponsor store staff', error);
    return NextResponse.json({ error: 'Failed to update staff' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, staff: { id: data.id } });
}, 'admin-sponsor-staff-update');

