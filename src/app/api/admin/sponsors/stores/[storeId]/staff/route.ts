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

const STORE_ID_SCHEMA = z.string().uuid();

const ADD_STAFF_SCHEMA = z.object({
  userId: z.string().uuid(),
  role: z.enum(['manager', 'cashier']).optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 240 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 240 } as const;

export const POST = withSentryRoute(async (request: Request, ctx: { params: Promise<{ storeId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-staff:add:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawStoreId = (await ctx.params).storeId;
  const parsedStoreId = STORE_ID_SCHEMA.safeParse(rawStoreId);
  if (!parsedStoreId.success) {
    return NextResponse.json({ error: 'Invalid store id' }, { status: 400 });
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

  const userRate = checkRateLimit(`admin-sponsor-staff:add:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = ADD_STAFF_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from('sponsor_store_staff')
    .insert({
      store_id: parsedStoreId.data,
      user_id: payload.userId,
      role: payload.role ?? 'cashier',
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to add sponsor store staff', error);
    const isUnique = typeof error.message === 'string' && error.message.toLowerCase().includes('unique');
    return NextResponse.json({ error: isUnique ? 'User is already staff for this store' : 'Failed to add staff' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, staff: { id: data.id } });
}, 'admin-sponsor-staff-add');

