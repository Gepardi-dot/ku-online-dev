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
  'http://localhost:5000',
]);

const RATE_IP = { windowMs: 60_000, max: 50 } as const;
const RATE_USER = { windowMs: 60_000, max: 25 } as const;

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const subscribePayloadSchema = z.object({
  subscription: subscriptionSchema,
});

const unsubscribePayloadSchema = z.object({
  endpoint: z.string().url(),
});

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function ensurePushEnabled() {
  if (!env.NEXT_PUBLIC_PWA_PUSH_ENABLED) {
    return NextResponse.json({ error: 'Push notifications are disabled' }, { status: 503 });
  }
  return null;
}

async function authenticate() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function validateOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }
  return null;
}

function checkIpRateLimit(headers: Headers) {
  const clientIdentifier = getClientIdentifier(headers);
  if (clientIdentifier === 'unknown') {
    return null;
  }
  const result = checkRateLimit(`push-subscription:ip:${clientIdentifier}`, RATE_IP);
  if (!result.success) {
    return tooManyRequestsResponse(result.retryAfter, 'Too many push subscription requests. Try again later.');
  }
  return null;
}

function checkUserRateLimit(userId: string) {
  const result = checkRateLimit(`push-subscription:user:${userId}`, RATE_USER);
  if (!result.success) {
    return tooManyRequestsResponse(result.retryAfter, 'Push subscription rate limit reached. Try again later.');
  }
  return null;
}

export const GET = withSentryRoute(async (request: Request) => {
  const disabled = ensurePushEnabled();
  if (disabled) return disabled;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const rateError = checkIpRateLimit(request.headers);
  if (rateError) return rateError;

  const { supabase, user } = await authenticate();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRateError = checkUserRateLimit(user.id);
  if (userRateError) return userRateError;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, expiration_time, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to list push subscriptions', error);
    return NextResponse.json({ error: 'Failed to list push subscriptions' }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data ?? [] });
});

export const POST = withSentryRoute(async (request: Request) => {
  const disabled = ensurePushEnabled();
  if (disabled) return disabled;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const rateError = checkIpRateLimit(request.headers);
  if (rateError) return rateError;

  const payload = await request.json().catch(() => null);
  const parsed = subscribePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
  }

  const { supabase, user } = await authenticate();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRateError = checkUserRateLimit(user.id);
  if (userRateError) return userRateError;

  const subscription = parsed.data.subscription;
  const expirationTimeIso =
    typeof subscription.expirationTime === 'number'
      ? new Date(subscription.expirationTime).toISOString()
      : null;

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh_key: subscription.keys.p256dh,
      auth_key: subscription.keys.auth,
      expiration_time: expirationTimeIso,
      user_agent: request.headers.get('user-agent'),
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.error('Failed to upsert push subscription', error);
    return NextResponse.json({ error: 'Failed to save push subscription' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withSentryRoute(async (request: Request) => {
  const disabled = ensurePushEnabled();
  if (disabled) return disabled;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const rateError = checkIpRateLimit(request.headers);
  if (rateError) return rateError;

  const payload = await request.json().catch(() => null);
  const parsed = unsubscribePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid unsubscribe payload' }, { status: 400 });
  }

  const { supabase, user } = await authenticate();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRateError = checkUserRateLimit(user.id);
  if (userRateError) return userRateError;

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', parsed.data.endpoint);

  if (error) {
    console.error('Failed to delete push subscription', error);
    return NextResponse.json({ error: 'Failed to delete push subscription' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
