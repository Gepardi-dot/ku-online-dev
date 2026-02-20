'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PwaTelemetrySummary } from '@/lib/pwa/telemetry-store';

type SummaryResponse = {
  ok: true;
  source?: 'durable' | 'memory';
  durableEnabled?: boolean;
  summary: PwaTelemetrySummary;
} | {
  ok: false;
  error?: string;
};

type AlertRunResult = {
  status: 'sent' | 'skipped' | 'error';
  reason?: string;
  alertCount?: number;
  summaryStatus?: 'pass' | 'warn' | 'fail';
  source?: 'durable' | 'memory';
};

type AlertTriggerResponse = {
  ok: true;
  result: AlertRunResult;
} | {
  ok: false;
  error?: string;
  result?: AlertRunResult;
};

type StatusTone = 'pass' | 'warn' | 'fail' | 'insufficient';

const WINDOW_OPTIONS = [
  { label: '15m', value: 15 },
  { label: '1h', value: 60 },
  { label: '6h', value: 360 },
  { label: '24h', value: 1_440 },
] as const;

const DISPLAY_MODE_OPTIONS = [
  { label: 'All modes', value: 'all' },
  { label: 'Browser only', value: 'browser' },
  { label: 'Standalone only', value: 'standalone' },
  { label: 'Unknown mode', value: 'unknown' },
] as const;

function formatMetric(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

function formatRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function summarizeTone(value: number | null, target: number, count: number, minSamples: number): StatusTone {
  if (value === null || count < minSamples) {
    return 'insufficient';
  }
  if (value <= target) {
    return 'pass';
  }
  if (value <= target * 1.1) {
    return 'warn';
  }
  return 'fail';
}

function summarizeRateTone(value: number | null, target: number, count: number, minSamples: number): StatusTone {
  if (value === null || count < minSamples) {
    return 'insufficient';
  }
  if (value >= target) {
    return 'pass';
  }
  if (value >= target * 0.9) {
    return 'warn';
  }
  return 'fail';
}

function toneClasses(tone: StatusTone) {
  if (tone === 'fail') return 'bg-red-50 text-red-700 border-red-200';
  if (tone === 'warn') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (tone === 'pass') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function toneLabel(tone: StatusTone) {
  if (tone === 'fail') return 'Fail';
  if (tone === 'warn') return 'Warn';
  if (tone === 'pass') return 'Pass';
  return 'Insufficient';
}

function formatAlertRunResult(result: AlertRunResult) {
  const source = result.source ?? 'memory';
  if (result.status === 'sent') {
    return `Alert dispatched (${result.alertCount ?? 0} active alert(s), source: ${source}).`;
  }
  if (result.status === 'skipped') {
    if (result.reason === 'no_active_alerts') {
      return `No active alerts. Dispatch skipped (source: ${source}).`;
    }
    if (result.reason === 'duplicate_within_cooldown') {
      return `Duplicate alert within cooldown. Dispatch skipped (source: ${source}).`;
    }
    return `Alert check skipped (${result.reason ?? 'no-op'}, source: ${source}).`;
  }
  return `Alert check failed (${result.reason ?? 'unknown_error'}).`;
}

type PwaTelemetryCardProps = {
  canTriggerAlerts?: boolean;
};

export default function PwaTelemetryCard({ canTriggerAlerts = false }: PwaTelemetryCardProps) {
  const [windowMinutes, setWindowMinutes] = useState<number>(60);
  const [displayMode, setDisplayMode] = useState<'all' | 'browser' | 'standalone' | 'unknown'>('all');
  const [pathPrefixInput, setPathPrefixInput] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PwaTelemetrySummary | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [source, setSource] = useState<'durable' | 'memory' | null>(null);
  const [durableEnabled, setDurableEnabled] = useState<boolean>(false);
  const [alertRunLoading, setAlertRunLoading] = useState(false);
  const [alertRunSuccess, setAlertRunSuccess] = useState<string | null>(null);
  const [alertRunError, setAlertRunError] = useState<string | null>(null);
  const [installResetSuccess, setInstallResetSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        windowMinutes: String(windowMinutes),
        displayMode,
      });
      if (pathPrefix.trim()) {
        params.set('pathPrefix', pathPrefix.trim());
      }

      try {
        const response = await fetch(`/api/admin/pwa/telemetry/summary?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => null)) as SummaryResponse | null;
        if (cancelled) return;

        if (!response.ok || !payload || !payload.ok) {
          setError(payload && 'error' in payload && payload.error ? payload.error : 'Failed to load telemetry summary.');
          setSummary(null);
          setSource(null);
          return;
        }

        setSummary(payload.summary);
        setSource(payload.source ?? null);
        setDurableEnabled(Boolean(payload.durableEnabled));
      } catch (requestError) {
        if (cancelled || controller.signal.aborted) return;
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setError('Failed to load telemetry summary.');
        setSummary(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [windowMinutes, displayMode, pathPrefix, refreshCounter]);

  async function runAlertCheck(force = false) {
    setAlertRunLoading(true);
    setAlertRunSuccess(null);
    setAlertRunError(null);

    try {
      const response = await fetch('/api/admin/pwa/slo-alerts/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowMinutes,
          displayMode,
          pathPrefix: pathPrefix.trim() || null,
          force,
        }),
      });

      const payload = (await response.json().catch(() => null)) as AlertTriggerResponse | null;
      if (!response.ok || !payload || !payload.ok) {
        const message =
          payload && 'error' in payload && payload.error
            ? payload.error
            : 'Failed to run alert check.';
        setAlertRunError(message);
        return;
      }

      setAlertRunSuccess(formatAlertRunResult(payload.result));
      setRefreshCounter((value) => value + 1);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === 'AbortError') {
        return;
      }
      setAlertRunError('Failed to run alert check.');
    } finally {
      setAlertRunLoading(false);
    }
  }

  function resetInstallPromptForBrowser() {
    if (typeof window === 'undefined') {
      return;
    }

    setInstallResetSuccess(null);

    const onResetComplete = () => {
      setInstallResetSuccess('Install prompt state reset for this browser.');
    };

    window.addEventListener('ku-pwa-install-debug-reset-complete', onResetComplete, { once: true });
    window.dispatchEvent(new CustomEvent('ku-pwa-install-debug-reset'));
  }

  const vitalRows = useMemo(() => {
    if (!summary) return [];
    const minSamples = summary.thresholds.minSamples;
    return [
      {
        key: 'lcp',
        label: 'LCP p75',
        value: summary.webVitals.lcp.p75,
        target: summary.thresholds.lcpP75Ms,
        count: summary.webVitals.lcp.count,
        tone: summarizeTone(
          summary.webVitals.lcp.p75,
          summary.thresholds.lcpP75Ms,
          summary.webVitals.lcp.count,
          minSamples,
        ),
        unit: 'ms',
      },
      {
        key: 'inp',
        label: 'INP p75',
        value: summary.webVitals.inp.p75,
        target: summary.thresholds.inpP75Ms,
        count: summary.webVitals.inp.count,
        tone: summarizeTone(
          summary.webVitals.inp.p75,
          summary.thresholds.inpP75Ms,
          summary.webVitals.inp.count,
          minSamples,
        ),
        unit: 'ms',
      },
      {
        key: 'cls',
        label: 'CLS p75',
        value: summary.webVitals.cls.p75,
        target: summary.thresholds.clsP75,
        count: summary.webVitals.cls.count,
        tone: summarizeTone(
          summary.webVitals.cls.p75,
          summary.thresholds.clsP75,
          summary.webVitals.cls.count,
          minSamples,
        ),
        unit: 'score',
      },
      {
        key: 'fcp',
        label: 'FCP p75',
        value: summary.webVitals.fcp.p75,
        target: summary.thresholds.fcpP75Ms,
        count: summary.webVitals.fcp.count,
        tone: summarizeTone(
          summary.webVitals.fcp.p75,
          summary.thresholds.fcpP75Ms,
          summary.webVitals.fcp.count,
          minSamples,
        ),
        unit: 'ms',
      },
      {
        key: 'ttfb',
        label: 'TTFB p75',
        value: summary.webVitals.ttfb.p75,
        target: summary.thresholds.ttfbP75Ms,
        count: summary.webVitals.ttfb.count,
        tone: summarizeTone(
          summary.webVitals.ttfb.p75,
          summary.thresholds.ttfbP75Ms,
          summary.webVitals.ttfb.count,
          minSamples,
        ),
        unit: 'ms',
      },
    ];
  }, [summary]);

  const funnelRows = useMemo(() => {
    if (!summary) return [];
    const minSamples = summary.thresholds.minSamples;
    return [
      {
        key: 'install',
        label: 'Install accept rate',
        value: summary.funnels.install.acceptanceRate,
        target: summary.thresholds.installAcceptRateMin,
        count: summary.funnels.install.shown,
        tone: summarizeRateTone(
          summary.funnels.install.acceptanceRate,
          summary.thresholds.installAcceptRateMin,
          summary.funnels.install.shown,
          minSamples,
        ),
      },
      {
        key: 'push',
        label: 'Push enable rate',
        value: summary.funnels.push.enableRate,
        target: summary.thresholds.pushEnableRateMin,
        count: summary.funnels.push.shown,
        tone: summarizeRateTone(
          summary.funnels.push.enableRate,
          summary.thresholds.pushEnableRateMin,
          summary.funnels.push.shown,
          minSamples,
        ),
      },
      {
        key: 'sw',
        label: 'SW registration failure rate',
        value: summary.funnels.serviceWorker.failureRate,
        target: summary.thresholds.swRegistrationFailureRateMax,
        count:
          summary.funnels.serviceWorker.registered +
          summary.funnels.serviceWorker.registrationFailed,
        tone: summarizeTone(
          summary.funnels.serviceWorker.failureRate,
          summary.thresholds.swRegistrationFailureRateMax,
          summary.funnels.serviceWorker.registered + summary.funnels.serviceWorker.registrationFailed,
          minSamples,
        ),
      },
    ];
  }, [summary]);

  const statusTone = summary?.status ?? 'insufficient';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className={toneClasses(statusTone)}>{toneLabel(statusTone)}</Badge>
        <p className="text-xs text-muted-foreground">
          {summary
            ? `Window: ${summary.windowMinutes}m · ${summary.totals.events} events · ${summary.totals.eventsPerMinute}/min`
            : 'No summary loaded yet'}
        </p>
        {summary ? (
          <p className="text-xs text-muted-foreground">
            Source: {source ?? 'memory'}
            {durableEnabled ? '' : ' (durable disabled)'}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs text-muted-foreground">
          Window
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
            value={windowMinutes}
            onChange={(event) => setWindowMinutes(Number(event.target.value))}
          >
            {WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs text-muted-foreground">
          Display mode
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
            value={displayMode}
            onChange={(event) => setDisplayMode(event.target.value as 'all' | 'browser' | 'standalone' | 'unknown')}
          >
            {DISPLAY_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs text-muted-foreground">
          Path prefix
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
            value={pathPrefixInput}
            onChange={(event) => setPathPrefixInput(event.target.value)}
            placeholder="/products"
          />
        </label>

        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setPathPrefix(pathPrefixInput.trim())}
            disabled={loading}
          >
            Apply filters
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => setRefreshCounter((value) => value + 1)}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {canTriggerAlerts ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void runAlertCheck(false);
              }}
              disabled={loading || alertRunLoading}
            >
              {alertRunLoading ? 'Running alert check...' : 'Run alert check'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                void runAlertCheck(true);
              }}
              disabled={loading || alertRunLoading}
            >
              Force send
            </Button>
            <p className="text-xs text-muted-foreground">Runs webhook dispatch logic using current filters.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={resetInstallPromptForBrowser}>
              Reset install prompt (this browser)
            </Button>
            <p className="text-xs text-muted-foreground">
              Clears local/session install-banner memory for QA testing.
            </p>
          </div>
        </div>
      ) : null}

      {installResetSuccess ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
          {installResetSuccess}
        </div>
      ) : null}

      {alertRunSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {alertRunSuccess}
        </div>
      ) : null}

      {alertRunError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {alertRunError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading telemetry summary...</p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {summary ? (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border bg-background/80 px-3 py-2">
              <p className="text-xs text-muted-foreground">Display mode</p>
              <p className="text-sm font-semibold">
                browser {summary.displayModeBreakdown.browser} · standalone {summary.displayModeBreakdown.standalone}
              </p>
              <p className="text-xs text-muted-foreground">
                Poor vitals rate: {formatRate(summary.totals.poorVitalsRate)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/80 px-3 py-2">
              <p className="text-xs text-muted-foreground">Install funnel</p>
              <p className="text-sm font-semibold">
                shown {summary.funnels.install.shown} · accepted {summary.funnels.install.accepted}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/80 px-3 py-2">
              <p className="text-xs text-muted-foreground">Push funnel</p>
              <p className="text-sm font-semibold">
                shown {summary.funnels.push.shown} · enabled {summary.funnels.push.enabled}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/80 px-3 py-2">
              <p className="text-xs text-muted-foreground">Generated</p>
              <p className="text-sm font-semibold">{new Date(summary.generatedAt).toLocaleTimeString()}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Metric</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">p75</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Target</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Samples</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vitalRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">
                      {formatMetric(row.value, row.unit === 'score' ? 3 : 0)} {row.unit === 'score' ? '' : row.unit}
                    </td>
                    <td className="px-3 py-2">
                      {formatMetric(row.target, row.unit === 'score' ? 3 : 0)} {row.unit === 'score' ? '' : row.unit}
                    </td>
                    <td className="px-3 py-2">{row.count}</td>
                    <td className="px-3 py-2">
                      <Badge className={toneClasses(row.tone)}>{toneLabel(row.tone)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Funnel</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Target</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Samples</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {funnelRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">{formatRate(row.value)}</td>
                    <td className="px-3 py-2">{formatRate(row.target)}</td>
                    <td className="px-3 py-2">{row.count}</td>
                    <td className="px-3 py-2">
                      <Badge className={toneClasses(row.tone)}>{toneLabel(row.tone)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.alerts.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <p className="text-sm font-semibold">Active alerts</p>
              <div className="space-y-1">
                {summary.alerts.map((alert) => (
                  <p key={alert.key} className="text-xs text-muted-foreground">
                    {alert.label}: {alert.current} {alert.comparator} {alert.target} ({alert.severity})
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              No active SLO alerts for the current filter window.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
