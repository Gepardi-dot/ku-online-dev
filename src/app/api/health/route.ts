import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { getEnv } from '@/lib/env';
import { createClient } from '@/utils/supabase/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const {
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
} = getEnv();

const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

type CheckStatus = 'ok' | 'error';
const HEALTH_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;

function toSafeErrorLabel(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('bucket')) return 'storage_unavailable';
  if (message.includes('permission') || message.includes('rls') || message.includes('not allowed')) return 'forbidden';
  return 'unavailable';
}

export const GET = withSentryRoute(async (request: NextRequest) => {
  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`health:ip:${clientIdentifier}`, HEALTH_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const response = NextResponse.json(
        { error: 'Too many health requests. Please try again later.' },
        { status: 429 },
      );
      response.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return response;
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const checks: {
    database: { status: CheckStatus; latencyMs?: number; error?: string };
    storage: { status: CheckStatus; bucket: string; error?: string };
  } = {
    database: { status: 'ok' },
    storage: { status: 'ok', bucket: STORAGE_BUCKET },
  };

  try {
    const start = Date.now();
    const { error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }
    checks.database.latencyMs = Date.now() - start;
  } catch (error) {
    checks.database.status = 'error';
    checks.database.error = toSafeErrorLabel(error);
    console.error('Health database check failed', error);
  }

  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).list('', { limit: 1 });
    if (error) {
      throw error;
    }
  } catch (error) {
    checks.storage.status = 'error';
    checks.storage.error = toSafeErrorLabel(error);
    console.error('Health storage check failed', error);
  }

  const healthy = checks.database.status === 'ok' && checks.storage.status === 'ok';

  return NextResponse.json({
    ok: healthy,
    timestamp: new Date().toISOString(),
    checks,
  }, { status: healthy ? 200 : 503 });
});
