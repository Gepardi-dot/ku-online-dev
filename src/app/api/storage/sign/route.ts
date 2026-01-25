import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { performance } from 'node:perf_hooks';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { createSignedUrls, createTransformedSignedUrls } from '@/lib/storage';
import { checkRateLimit } from '@/lib/rate-limit';

type SignRequest = {
  paths?: string[];
  transform?: {
    width?: number;
    height?: number;
    resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
    quality?: number;
    format?: 'webp' | 'png' | 'jpeg';
  };
};

const TIMING_ENABLED = process.env.CHAT_TIMINGS === '1';

export const POST = withSentryRoute(async (request: Request) => {
  const requestStart = TIMING_ENABLED ? performance.now() : 0;
  const headers = new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Vary: 'Cookie',
  });

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (TIMING_ENABLED) {
      console.info('[chat-timing] storage:sign', {
        ms: Math.round(performance.now() - requestStart),
        status: 401,
      });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  const body = (await request.json().catch(() => ({}))) as SignRequest;
  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  const expiresInSeconds = 60 * 60;

  const rate = checkRateLimit({
    key: `storage-sign:${user.id}`,
    windowMs: 60_000,
    limit: 60,
  });
  if (!rate.allowed) {
    headers.set('Retry-After', String(rate.retryAfterSeconds));
    headers.set('X-RateLimit-Limit', '60');
    headers.set('X-RateLimit-Remaining', '0');
    headers.set('X-RateLimit-Reset', String(rate.resetAt));
    if (TIMING_ENABLED) {
      console.info('[chat-timing] storage:sign', {
        ms: Math.round(performance.now() - requestStart),
        status: 429,
      });
    }
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers });
  }
  headers.set('X-RateLimit-Limit', '60');
  headers.set('X-RateLimit-Remaining', String(rate.remaining));
  headers.set('X-RateLimit-Reset', String(rate.resetAt));

  // Sanitize and cap the request size for safety
  const paths = rawPaths
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .slice(0, 100);

  if (paths.length === 0) {
    if (TIMING_ENABLED) {
      console.info('[chat-timing] storage:sign', {
        ms: Math.round(performance.now() - requestStart),
        status: 200,
        paths: 0,
      });
    }
    return NextResponse.json(
      { map: {}, expiresInSeconds, expiresAt: Date.now() + expiresInSeconds * 1000 },
      { headers },
    );
  }

  const signStart = TIMING_ENABLED ? performance.now() : 0;
  const map = body.transform
    ? await createTransformedSignedUrls(paths, body.transform, expiresInSeconds)
    : await createSignedUrls(paths, expiresInSeconds);
  const signMs = TIMING_ENABLED ? performance.now() - signStart : 0;
  if (TIMING_ENABLED) {
    console.info('[chat-timing] storage:sign', {
      ms: Math.round(performance.now() - requestStart),
      status: 200,
      paths: paths.length,
      signed: Object.keys(map).length,
      transform: Boolean(body.transform),
      signMs: Math.round(signMs),
    });
  }
  return NextResponse.json(
    { map, expiresInSeconds, expiresAt: Date.now() + expiresInSeconds * 1000 },
    { headers },
  );
});
