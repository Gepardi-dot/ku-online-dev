import crypto from 'node:crypto';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';
import {
  cleanupDurablePwaTelemetryRetention,
  getDurablePwaTelemetrySummary,
  isDurableTelemetryEnabled,
} from '@/lib/pwa/telemetry-durable';
import { getPwaTelemetrySummary, type PwaTelemetryDisplayMode } from '@/lib/pwa/telemetry-store';

type AlertCheckOptions = {
  windowMinutes?: number;
  displayMode?: 'all' | PwaTelemetryDisplayMode;
  pathPrefix?: string | null;
  force?: boolean;
  triggeredBy?: string;
};

export type PwaSloAlertRunResult = {
  ok: boolean;
  status: 'sent' | 'skipped' | 'error';
  reason?: string;
  fingerprint?: string;
  alertCount?: number;
  summaryStatus?: 'pass' | 'warn' | 'fail';
  source?: 'durable' | 'memory';
};

type DispatchStatus =
  | 'sent'
  | 'failed'
  | 'skipped_pass'
  | 'skipped_duplicate'
  | 'skipped_config';

const env = getEnv();
const webhookUrl = env.PWA_SLO_ALERT_WEBHOOK_URL?.trim() ?? '';
const cooldownMinutes = env.PWA_SLO_ALERT_COOLDOWN_MINUTES;
const timeoutMs = env.PWA_SLO_ALERT_TIMEOUT_MS;

const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeWindowMinutes(value: number | undefined) {
  const raw = value ?? 60;
  if (!Number.isFinite(raw)) return 60;
  return Math.max(5, Math.min(24 * 60, Math.floor(raw)));
}

function normalizeDisplayMode(value: AlertCheckOptions['displayMode']) {
  if (value === 'browser' || value === 'standalone' || value === 'unknown') {
    return value;
  }
  return 'all';
}

function normalizePathPrefix(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 180) return normalized.slice(0, 180);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function createAlertFingerprint(input: {
  windowMinutes: number;
  displayMode: 'all' | PwaTelemetryDisplayMode;
  pathPrefix: string | null;
  status: 'pass' | 'warn' | 'fail';
  alerts: Array<{
    key: string;
    severity: string;
    current: number;
    target: number;
    comparator: string;
  }>;
}) {
  const stableValue = JSON.stringify({
    windowMinutes: input.windowMinutes,
    displayMode: input.displayMode,
    pathPrefix: input.pathPrefix,
    status: input.status,
    alerts: input.alerts.map((alert) => ({
      key: alert.key,
      severity: alert.severity,
      current: Number(alert.current.toFixed(4)),
      target: Number(alert.target.toFixed(4)),
      comparator: alert.comparator,
    })),
  });
  return crypto.createHash('sha256').update(stableValue).digest('hex');
}

function buildWebhookPayload(input: {
  windowMinutes: number;
  displayMode: 'all' | PwaTelemetryDisplayMode;
  pathPrefix: string | null;
  summary: ReturnType<typeof getPwaTelemetrySummary>;
}) {
  const title = `[PWA SLO ${input.summary.status.toUpperCase()}] ${input.summary.alerts.length} active alert(s)`;
  const lines = [
    title,
    `Window: ${input.windowMinutes}m`,
    `Filter: mode=${input.displayMode}${input.pathPrefix ? ` path=${input.pathPrefix}` : ''}`,
    `Events: total=${input.summary.totals.events}, webVitals=${input.summary.totals.webVitals}, lifecycle=${input.summary.totals.lifecycle}`,
  ];

  for (const alert of input.summary.alerts) {
    lines.push(
      `- ${alert.label}: ${alert.current} ${alert.comparator} ${alert.target} (${alert.severity})`,
    );
  }

  return {
    event: 'pwa_slo_alert',
    generatedAt: input.summary.generatedAt,
    status: input.summary.status,
    text: lines.join('\n'),
    summary: {
      filter: input.summary.filter,
      totals: input.summary.totals,
      funnels: input.summary.funnels,
      alerts: input.summary.alerts,
      thresholds: input.summary.thresholds,
    },
  };
}

async function persistAlertDispatch(params: {
  fingerprint: string;
  deliveryStatus: DispatchStatus;
  summaryStatus: 'pass' | 'warn' | 'fail';
  alertCount: number;
  windowMinutes: number;
  displayMode: 'all' | PwaTelemetryDisplayMode;
  pathPrefix: string | null;
  payload: Record<string, unknown>;
  triggeredBy: string;
  deliveryError?: string | null;
}) {
  const { error } = await supabaseAdmin.from('pwa_slo_alert_dispatches').insert({
    fingerprint: params.fingerprint,
    delivery_status: params.deliveryStatus,
    summary_status: params.summaryStatus,
    alert_count: params.alertCount,
    window_minutes: params.windowMinutes,
    display_mode: params.displayMode,
    path_prefix: params.pathPrefix,
    payload: params.payload,
    triggered_by: params.triggeredBy,
    delivery_error: params.deliveryError ?? null,
  });

  if (error) {
    console.error('Failed to persist pwa_slo_alert_dispatches row', error);
  }
}

async function hasRecentSuccessfulDispatch(fingerprint: string) {
  const sinceIso = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('pwa_slo_alert_dispatches')
    .select('id')
    .eq('fingerprint', fingerprint)
    .eq('delivery_status', 'sent')
    .gte('created_at', sinceIso)
    .limit(1);

  if (error) {
    console.error('Failed to query pwa_slo_alert_dispatches for dedupe', error);
    return false;
  }

  return Boolean(data && data.length > 0);
}

export async function runPwaSloAlertCheck(options: AlertCheckOptions = {}): Promise<PwaSloAlertRunResult> {
  const windowMinutes = normalizeWindowMinutes(options.windowMinutes);
  const displayMode = normalizeDisplayMode(options.displayMode);
  const pathPrefix = normalizePathPrefix(options.pathPrefix);
  const force = Boolean(options.force);
  const triggeredBy = options.triggeredBy?.trim() || 'manual';

  let summarySource: 'durable' | 'memory' = 'memory';
  let summary = null;

  if (isDurableTelemetryEnabled()) {
    summary = await getDurablePwaTelemetrySummary({
      windowMinutes,
      displayMode,
      pathPrefix,
    });
    if (summary) {
      summarySource = 'durable';
    }

    const cleanupResult = await cleanupDurablePwaTelemetryRetention();
    if (!cleanupResult.ok && !cleanupResult.skipped) {
      console.warn('PWA telemetry retention cleanup failed', cleanupResult.error);
    }
  }

  if (!summary) {
    summary = getPwaTelemetrySummary({
      windowMinutes,
      displayMode,
      pathPrefix,
    });
    summarySource = 'memory';
  }

  const fingerprint = createAlertFingerprint({
    windowMinutes,
    displayMode,
    pathPrefix,
    status: summary.status,
    alerts: summary.alerts,
  });

  if (summary.status === 'pass' || summary.alerts.length === 0) {
    await persistAlertDispatch({
      fingerprint,
      deliveryStatus: 'skipped_pass',
      summaryStatus: summary.status,
      alertCount: summary.alerts.length,
      windowMinutes,
      displayMode,
      pathPrefix,
      payload: {
        source: summarySource,
        generatedAt: summary.generatedAt,
        totals: summary.totals,
      },
      triggeredBy,
    });

    return {
      ok: true,
      status: 'skipped',
      reason: 'no_active_alerts',
      fingerprint,
      alertCount: 0,
      summaryStatus: summary.status,
      source: summarySource,
    };
  }

  if (!webhookUrl) {
    await persistAlertDispatch({
      fingerprint,
      deliveryStatus: 'skipped_config',
      summaryStatus: summary.status,
      alertCount: summary.alerts.length,
      windowMinutes,
      displayMode,
      pathPrefix,
      payload: {
        source: summarySource,
        generatedAt: summary.generatedAt,
        alerts: summary.alerts,
      },
      triggeredBy,
      deliveryError: 'PWA_SLO_ALERT_WEBHOOK_URL is not configured',
    });

    return {
      ok: false,
      status: 'error',
      reason: 'missing_webhook_config',
      fingerprint,
      alertCount: summary.alerts.length,
      summaryStatus: summary.status,
      source: summarySource,
    };
  }

  if (!force) {
    const isDuplicate = await hasRecentSuccessfulDispatch(fingerprint);
    if (isDuplicate) {
      await persistAlertDispatch({
        fingerprint,
        deliveryStatus: 'skipped_duplicate',
        summaryStatus: summary.status,
        alertCount: summary.alerts.length,
        windowMinutes,
        displayMode,
        pathPrefix,
        payload: {
          source: summarySource,
          generatedAt: summary.generatedAt,
          alerts: summary.alerts,
        },
        triggeredBy,
      });

      return {
        ok: true,
        status: 'skipped',
        reason: 'duplicate_within_cooldown',
        fingerprint,
        alertCount: summary.alerts.length,
        summaryStatus: summary.status,
        source: summarySource,
      };
    }
  }

  const payload = buildWebhookPayload({
    windowMinutes,
    displayMode,
    pathPrefix,
    summary,
  });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const message = `Webhook returned ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`;
      await persistAlertDispatch({
        fingerprint,
        deliveryStatus: 'failed',
        summaryStatus: summary.status,
        alertCount: summary.alerts.length,
        windowMinutes,
        displayMode,
        pathPrefix,
        payload,
        triggeredBy,
        deliveryError: message,
      });

      return {
        ok: false,
        status: 'error',
        reason: message,
        fingerprint,
        alertCount: summary.alerts.length,
        summaryStatus: summary.status,
        source: summarySource,
      };
    }

    await persistAlertDispatch({
      fingerprint,
      deliveryStatus: 'sent',
      summaryStatus: summary.status,
      alertCount: summary.alerts.length,
      windowMinutes,
      displayMode,
      pathPrefix,
      payload,
      triggeredBy,
    });

    return {
      ok: true,
      status: 'sent',
      fingerprint,
      alertCount: summary.alerts.length,
      summaryStatus: summary.status,
      source: summarySource,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook dispatch error';
    await persistAlertDispatch({
      fingerprint,
      deliveryStatus: 'failed',
      summaryStatus: summary.status,
      alertCount: summary.alerts.length,
      windowMinutes,
      displayMode,
      pathPrefix,
      payload,
      triggeredBy,
      deliveryError: message,
    });

    return {
      ok: false,
      status: 'error',
      reason: message,
      fingerprint,
      alertCount: summary.alerts.length,
      summaryStatus: summary.status,
      source: summarySource,
    };
  }
}
