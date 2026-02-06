import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
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

const OFFER_ID_SCHEMA = z.string().uuid();

const CLAIM_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 30 } as const;
const CLAIM_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 15 } as const;

function normalizeRpcError(message: string | null | undefined): string {
  return typeof message === 'string' ? message.trim() : '';
}

function mapRpcErrorToResponse(errorMessage: string) {
  const code = errorMessage;

  if (code === 'NOT_AUTHENTICATED') {
    return { status: 401, error: 'Not authenticated' };
  }
  if (code === 'OFFER_NOT_FOUND') {
    return { status: 404, error: 'Offer not found' };
  }
  if (code === 'STORE_DISABLED') {
    return { status: 403, error: 'Store is unavailable' };
  }
  if (code === 'OFFER_NOT_ACTIVE') {
    return { status: 410, error: 'Offer is not active' };
  }
  if (code === 'OFFER_EXPIRED') {
    return { status: 410, error: 'Offer expired' };
  }
  if (code === 'OFFER_SOLD_OUT') {
    return { status: 410, error: 'Offer limit reached' };
  }
  if (code === 'CLAIM_LIMIT_REACHED' || code === 'REDEMPTION_LIMIT_REACHED') {
    return { status: 409, error: 'You already claimed this voucher' };
  }

  return { status: 500, error: 'Failed to claim voucher' };
}

export const POST = withSentryRoute(async (request: Request, ctx: { params: Promise<{ offerId: string }> }) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-claim:ip:${clientIdentifier}`, CLAIM_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const rawOfferId = (await ctx.params).offerId;
  const parsedOfferId = OFFER_ID_SCHEMA.safeParse(rawOfferId);
  if (!parsedOfferId.success) {
    return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 });
  }
  const offerId = parsedOfferId.data;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`sponsor-claim:user:${user.id}`, CLAIM_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many voucher claims. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const { data, error } = await supabase.rpc('claim_sponsor_voucher', { p_offer_id: offerId });
  if (error) {
    const code = normalizeRpcError(error.message);
    const mapped = mapRpcErrorToResponse(code);
    return NextResponse.json({ error: mapped.error, code }, { status: mapped.status });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.claim_id || !row?.code) {
    return NextResponse.json({ error: 'Failed to claim voucher' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    claim: {
      id: row.claim_id,
      code: row.code,
      expiresAt: row.expires_at ?? null,
      offer: {
        id: row.offer_id,
        title: row.offer_title,
      },
      store: {
        id: row.store_id,
        slug: row.store_slug,
        name: row.store_name,
      },
    },
  });
});

