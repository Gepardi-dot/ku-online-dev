import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';
import {
  normalizePwaTelemetryDisplayMode,
  normalizePwaTelemetryEvent,
  normalizePwaTelemetryName,
  normalizePwaTelemetryPath,
  summarizePwaTelemetryEvents,
  type PwaTelemetryIngestedContext,
  type PwaTelemetryIngestedEvent,
  type PwaTelemetryStoredEvent,
  type PwaTelemetrySummary,
  type PwaTelemetrySummaryOptions,
} from '@/lib/pwa/telemetry-store';

type DurableTelemetryRow = {
  event_type: string;
  name: string;
  event_ts: string;
  path: string;
  value: number | null;
  rating: string | null;
  display_mode: string;
};

const env = getEnv();
const durableTelemetryEnabled = env.PWA_TELEMETRY_DURABLE_ENABLED;
const telemetrySummaryFetchLimit = env.PWA_TELEMETRY_SUMMARY_MAX_ROWS;
const telemetryRetentionDays = env.PWA_TELEMETRY_RETENTION_DAYS;

const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeRow(row: DurableTelemetryRow): PwaTelemetryStoredEvent | null {
  if (row.event_type !== 'web_vital' && row.event_type !== 'pwa_lifecycle') {
    return null;
  }

  const eventTimestamp = Date.parse(row.event_ts);
  if (!Number.isFinite(eventTimestamp)) {
    return null;
  }

  const rating =
    row.rating === 'good' || row.rating === 'needs-improvement' || row.rating === 'poor'
      ? row.rating
      : null;

  return {
    type: row.event_type,
    name: normalizePwaTelemetryName(row.name ?? ''),
    ts: eventTimestamp,
    path: normalizePwaTelemetryPath(row.path ?? '/'),
    value: typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null,
    rating,
    displayMode: normalizePwaTelemetryDisplayMode(row.display_mode),
  };
}

export function isDurableTelemetryEnabled() {
  return durableTelemetryEnabled;
}

export async function persistDurablePwaTelemetryBatch(
  events: PwaTelemetryIngestedEvent[],
  context?: PwaTelemetryIngestedContext,
) {
  if (!durableTelemetryEnabled) {
    return { ok: false, persisted: 0, skipped: true as const };
  }

  const now = Date.now();
  const rows = events
    .map((event) => normalizePwaTelemetryEvent(event, context, now))
    .filter((event): event is PwaTelemetryStoredEvent => Boolean(event))
    .map((event) => ({
      event_type: event.type,
      name: event.name,
      event_ts: new Date(event.ts).toISOString(),
      path: event.path,
      value: event.value,
      rating: event.rating,
      display_mode: event.displayMode,
    }));

  if (rows.length === 0) {
    return { ok: true as const, persisted: 0, skipped: false as const };
  }

  const { error } = await supabaseAdmin.from('pwa_telemetry_events').insert(rows);
  if (error) {
    console.error('Failed to persist durable PWA telemetry events', error);
    return {
      ok: false,
      persisted: 0,
      skipped: false as const,
      error: error.message,
    };
  }

  return { ok: true as const, persisted: rows.length, skipped: false as const };
}

export async function getDurablePwaTelemetrySummary(
  options: PwaTelemetrySummaryOptions,
): Promise<PwaTelemetrySummary | null> {
  if (!durableTelemetryEnabled) {
    return null;
  }

  const now = Date.now();
  const windowMinutes = Math.max(5, Math.min(24 * 60, Math.floor(options.windowMinutes)));
  const windowStartIso = new Date(now - windowMinutes * 60 * 1000).toISOString();
  const pathPrefix = options.pathPrefix?.trim()
    ? normalizePwaTelemetryPath(options.pathPrefix)
    : null;

  let query = supabaseAdmin
    .from('pwa_telemetry_events')
    .select('event_type, name, event_ts, path, value, rating, display_mode')
    .gte('event_ts', windowStartIso)
    .order('event_ts', { ascending: false })
    .limit(telemetrySummaryFetchLimit);

  if (options.displayMode !== 'all') {
    query = query.eq('display_mode', options.displayMode);
  }

  if (pathPrefix) {
    query = query.like('path', `${pathPrefix}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load durable PWA telemetry summary data', error);
    return null;
  }

  const events = (data ?? [])
    .map((row) => normalizeRow(row as DurableTelemetryRow))
    .filter((event): event is PwaTelemetryStoredEvent => Boolean(event));

  return summarizePwaTelemetryEvents(events, options, now);
}

export async function cleanupDurablePwaTelemetryRetention() {
  if (!durableTelemetryEnabled) {
    return { ok: false, skipped: true as const };
  }

  const cutoffIso = new Date(Date.now() - telemetryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from('pwa_telemetry_events')
    .delete()
    .lt('event_ts', cutoffIso);

  if (error) {
    console.error('Failed to cleanup durable PWA telemetry events', error);
    return { ok: false, skipped: false as const, error: error.message };
  }

  return { ok: true as const, skipped: false as const, cutoffIso };
}
