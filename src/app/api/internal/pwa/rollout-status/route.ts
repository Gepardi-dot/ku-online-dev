import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { getDurablePwaTelemetrySummary, isDurableTelemetryEnabled } from '@/lib/pwa/telemetry-durable';
import { getPwaTelemetrySummary } from '@/lib/pwa/telemetry-store';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

type DispatchRow = {
  created_at: string;
  delivery_status: string;
  summary_status: string;
  alert_count: number;
  triggered_by: string;
  delivery_error: string | null;
};

const env = getEnv();
const alertSecret = env.PWA_SLO_ALERT_SECRET?.trim() || null;
const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeWindowMinutes(value: string | null) {
  const raw = Number(value ?? 60);
  if (!Number.isFinite(raw)) return 60;
  return Math.max(5, Math.min(24 * 60, Math.floor(raw)));
}

function normalizeDisplayMode(value: string | null): 'all' | 'browser' | 'standalone' | 'unknown' {
  if (value === 'browser' || value === 'standalone' || value === 'unknown') {
    return value;
  }
  return 'all';
}

function normalizePathPrefix(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 180) return normalized.slice(0, 180);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeDispatchLimit(value: string | null) {
  const raw = Number(value ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

function readSecretFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const fallbackHeader = request.headers.get('x-pwa-alert-secret');
  return fallbackHeader?.trim() ?? '';
}

async function handler(request: Request) {
  if (!alertSecret) {
    return NextResponse.json({ ok: false, error: 'Alert secret is not configured.' }, { status: 503 });
  }

  const providedSecret = readSecretFromRequest(request);
  if (!providedSecret || providedSecret !== alertSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`pwa-rollout-status:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const response = NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
      response.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return response;
    }
  }

  const url = new URL(request.url);
  const windowMinutes = normalizeWindowMinutes(url.searchParams.get('windowMinutes'));
  const displayMode = normalizeDisplayMode(url.searchParams.get('displayMode'));
  const pathPrefix = normalizePathPrefix(url.searchParams.get('pathPrefix'));
  const dispatchLimit = normalizeDispatchLimit(url.searchParams.get('dispatchLimit'));

  const summaryOptions = {
    windowMinutes,
    displayMode,
    pathPrefix,
  } as const;

  let source: 'durable' | 'memory' = 'memory';
  let summary = null;

  if (isDurableTelemetryEnabled()) {
    summary = await getDurablePwaTelemetrySummary(summaryOptions);
    if (summary) {
      source = 'durable';
    }
  }

  if (!summary) {
    summary = getPwaTelemetrySummary(summaryOptions);
    source = 'memory';
  }

  let recentDispatches: Array<{
    createdAt: string;
    deliveryStatus: string;
    summaryStatus: string;
    alertCount: number;
    triggeredBy: string;
    deliveryError: string | null;
  }> = [];
  let dispatchesUnavailable = false;
  let dispatchesError: string | null = null;

  const { data, error } = await supabaseAdmin
    .from('pwa_slo_alert_dispatches')
    .select('created_at, delivery_status, summary_status, alert_count, triggered_by, delivery_error')
    .order('created_at', { ascending: false })
    .limit(dispatchLimit);

  if (error) {
    dispatchesUnavailable = true;
    dispatchesError = error.message;
    console.warn('Failed to load pwa_slo_alert_dispatches in rollout status route', error);
  } else {
    recentDispatches = (data ?? []).map((row) => {
      const dispatch = row as DispatchRow;
      return {
        createdAt: dispatch.created_at,
        deliveryStatus: dispatch.delivery_status,
        summaryStatus: dispatch.summary_status,
        alertCount: dispatch.alert_count,
        triggeredBy: dispatch.triggered_by,
        deliveryError: dispatch.delivery_error,
      };
    });
  }

  return NextResponse.json({
    ok: true,
    observedAt: new Date().toISOString(),
    source,
    durableEnabled: isDurableTelemetryEnabled(),
    summary,
    recentDispatches,
    dispatchesUnavailable,
    dispatchesError,
    config: {
      pwaEnabled: env.NEXT_PUBLIC_PWA_ENABLED,
      rolloutPercent: env.NEXT_PUBLIC_PWA_ROLLOUT_PERCENT,
      installUiEnabled: env.NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED,
      pushEnabled: env.NEXT_PUBLIC_PWA_PUSH_ENABLED,
      telemetryEnabled: env.NEXT_PUBLIC_PWA_TELEMETRY_ENABLED,
    },
  });
}

export const GET = withSentryRoute(handler, 'internal-pwa-rollout-status-get');
