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

const BODY_SCHEMA = z.object({
  storeId: z.string().uuid(),
  code: z.string().min(4).max(64),
});

const REDEEM_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 40 } as const;
const REDEEM_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 25 } as const;

function normalizeRpcError(message: string | null | undefined): string {
  return typeof message === 'string' ? message.trim() : '';
}

function mapRpcErrorToResponse(errorMessage: string) {
  const code = errorMessage;
  if (code === 'NOT_AUTHENTICATED') return { status: 401, error: 'Not authenticated' };
  if (code === 'NOT_AUTHORIZED') return { status: 403, error: 'Not authorized for this store' };
  if (code === 'INVALID_CODE') return { status: 400, error: 'Invalid code' };
  if (code === 'CODE_NOT_FOUND') return { status: 404, error: 'Code not found' };
  if (code === 'ALREADY_REDEEMED') return { status: 409, error: 'Already redeemed' };
  if (code === 'VOUCHER_EXPIRED') return { status: 410, error: 'Voucher expired' };
  if (code === 'STORE_DISABLED') return { status: 403, error: 'Store is unavailable' };
  if (code === 'OFFER_EXPIRED') return { status: 410, error: 'Offer expired' };
  if (code === 'OFFER_SOLD_OUT') return { status: 410, error: 'Offer limit reached' };
  if (code === 'REDEMPTION_LIMIT_REACHED') return { status: 409, error: 'Redemption limit reached' };
  if (code === 'NOT_REDEEMABLE') return { status: 409, error: 'Voucher not redeemable' };
  return { status: 500, error: 'Failed to redeem voucher' };
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`sponsor-redeem:ip:${clientIdentifier}`, REDEEM_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = BODY_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { storeId, code } = parsed.data;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`sponsor-redeem:user:${user.id}`, REDEEM_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ error: 'Too many redemptions. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const { data, error } = await supabase.rpc('redeem_sponsor_voucher', { p_store_id: storeId, p_code: code });
  if (error) {
    const rpcCode = normalizeRpcError(error.message);
    const mapped = mapRpcErrorToResponse(rpcCode);
    return NextResponse.json({ error: mapped.error, code: rpcCode }, { status: mapped.status });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.redemption_id || !row?.claim_id) {
    return NextResponse.json({ error: 'Failed to redeem voucher' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    redemption: {
      id: row.redemption_id,
      claimId: row.claim_id,
      redeemedAt: row.redeemed_at ?? null,
      storeId: row.store_id ?? storeId,
      offerId: row.offer_id ?? null,
      offerTitle: row.offer_title ?? null,
    },
  });
});

