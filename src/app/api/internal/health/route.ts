import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  NEXT_PUBLIC_SITE_URL,
  ADMIN_REVALIDATE_TOKEN,
} = env;

const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_TOKEN = { windowMs: 60_000, max: 30 } as const;

const originAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const supabaseAdmin = createSupabaseServiceRole(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type CheckStatus = 'ok' | 'error';

function toSafeErrorLabel(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('bucket')) return 'storage_unavailable';
  if (message.includes('permission') || message.includes('rls') || message.includes('not allowed')) return 'forbidden';
  return 'unavailable';
}

function readAuthToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return (request.headers.get('x-admin-token') ?? '').trim();
}

function isAuthorized(request: NextRequest, expected: string): boolean {
  const provided = readAuthToken(request);
  if (!provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function tooManyRequestsResponse(retryAfter: number) {
  const response = NextResponse.json(
    { ok: false, error: 'Too many requests. Please try again later.' },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const GET = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const expectedToken = ADMIN_REVALIDATE_TOKEN?.trim() ?? '';
  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: 'Diagnostics token is not configured.' }, { status: 503 });
  }

  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const tokenRate = checkRateLimit('internal-health:token', RATE_LIMIT_PER_TOKEN);
  if (!tokenRate.success) {
    return tooManyRequestsResponse(tokenRate.retryAfter);
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`internal-health:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter);
    }
  }

  const checks: {
    database: { status: CheckStatus; latencyMs?: number; error?: string };
    storage: { status: CheckStatus; bucket: string; error?: string };
  } = {
    database: { status: 'ok' },
    storage: { status: 'ok', bucket: STORAGE_BUCKET },
  };

  try {
    const start = Date.now();
    const { error } = await supabaseAdmin.from('products').select('id').limit(1);
    if (error) throw error;
    checks.database.latencyMs = Date.now() - start;
  } catch (error) {
    checks.database.status = 'error';
    checks.database.error = toSafeErrorLabel(error);
    console.error('Internal health database check failed', error);
  }

  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
    if (error || !data) {
      throw error ?? new Error('Bucket not found');
    }
  } catch (error) {
    checks.storage.status = 'error';
    checks.storage.error = toSafeErrorLabel(error);
    console.error('Internal health storage check failed', error);
  }

  const healthy = checks.database.status === 'ok' && checks.storage.status === 'ok';

  return NextResponse.json(
    {
      ok: healthy,
      internal: true,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}, 'internal-health-diagnostics');
