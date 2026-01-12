import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
} = getEnv();

const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CheckStatus = 'ok' | 'error';

export const GET = withSentryRoute(async () => {
  const checks: {
    database: { status: CheckStatus; latencyMs?: number; error?: string };
    storage: { status: CheckStatus; bucket: string; error?: string };
  } = {
    database: { status: 'ok' },
    storage: { status: 'ok', bucket: STORAGE_BUCKET },
  };

  try {
    const start = Date.now();
    const { error } = await supabaseAdmin
      .from('products')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }
    checks.database.latencyMs = Date.now() - start;
  } catch (error) {
    checks.database.status = 'error';
    checks.database.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
    if (error || !data) {
      throw error ?? new Error('Bucket not found');
    }
  } catch (error) {
    checks.storage.status = 'error';
    checks.storage.error = error instanceof Error ? error.message : String(error);
  }

  const healthy = checks.database.status === 'ok' && checks.storage.status === 'ok';

  return NextResponse.json({
    ok: healthy,
    timestamp: new Date().toISOString(),
    checks,
  }, { status: healthy ? 200 : 503 });
});
