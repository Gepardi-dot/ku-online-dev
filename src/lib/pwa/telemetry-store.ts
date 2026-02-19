export type PwaTelemetryEventType = 'web_vital' | 'pwa_lifecycle';
export type PwaTelemetryDisplayMode = 'standalone' | 'browser' | 'unknown';
export type PwaTelemetryRating = 'good' | 'needs-improvement' | 'poor';

export type PwaTelemetryIngestedEvent = {
  type: PwaTelemetryEventType;
  name: string;
  ts: number;
  path: string;
  value?: number;
  unit?: 'ms' | 'score' | 'count';
  rating?: PwaTelemetryRating;
};

export type PwaTelemetryIngestedContext = {
  displayMode?: PwaTelemetryDisplayMode;
};

export type PwaTelemetryStoredEvent = {
  type: PwaTelemetryEventType;
  name: string;
  ts: number;
  path: string;
  value: number | null;
  rating: PwaTelemetryRating | null;
  displayMode: PwaTelemetryDisplayMode;
};

type SloSeverity = 'pass' | 'warn' | 'fail';
type VitalName = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

export type PwaTelemetrySummaryOptions = {
  windowMinutes: number;
  displayMode: 'all' | PwaTelemetryDisplayMode;
  pathPrefix?: string | null;
};

export type PwaTelemetrySloThresholds = {
  minSamples: number;
  lcpP75Ms: number;
  inpP75Ms: number;
  clsP75: number;
  fcpP75Ms: number;
  ttfbP75Ms: number;
  installAcceptRateMin: number;
  pushEnableRateMin: number;
  swRegistrationFailureRateMax: number;
  poorVitalsRateMax: number;
};

type PwaTelemetryVitalSummary = {
  count: number;
  p75: number | null;
  p95: number | null;
  average: number | null;
  poorRate: number | null;
  ratings: {
    good: number;
    needsImprovement: number;
    poor: number;
  };
};

type PwaLifecycleCounts = Record<string, number>;

type PwaFunnelSummary = {
  install: {
    shown: number;
    accepted: number;
    dismissed: number;
    acceptanceRate: number | null;
  };
  push: {
    shown: number;
    enabled: number;
    dismissed: number;
    denied: number;
    failed: number;
    enableRate: number | null;
  };
  serviceWorker: {
    registered: number;
    registrationFailed: number;
    failureRate: number | null;
  };
};

export type PwaTelemetryAlert = {
  key: string;
  label: string;
  severity: SloSeverity;
  current: number;
  target: number;
  comparator: '<=' | '>=';
};

export type PwaTelemetrySummary = {
  generatedAt: string;
  windowMinutes: number;
  filter: {
    displayMode: 'all' | PwaTelemetryDisplayMode;
    pathPrefix: string | null;
  };
  totals: {
    events: number;
    webVitals: number;
    lifecycle: number;
    eventsPerMinute: number;
    poorVitalsRate: number | null;
  };
  displayModeBreakdown: {
    browser: number;
    standalone: number;
    unknown: number;
  };
  webVitals: Record<VitalName, PwaTelemetryVitalSummary>;
  lifecycle: PwaLifecycleCounts;
  funnels: PwaFunnelSummary;
  thresholds: PwaTelemetrySloThresholds;
  alerts: PwaTelemetryAlert[];
  status: SloSeverity;
};

const RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_EVENTS = 60_000;
const MAX_EVENT_NAME = 64;
const MAX_PATH = 180;

const sharedStore = {
  events: [] as PwaTelemetryStoredEvent[],
  lastPrunedAt: 0,
};

function parseNumberEnv(
  key: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof options.min === 'number' && parsed < options.min) return fallback;
  if (typeof options.max === 'number' && parsed > options.max) return fallback;
  return parsed;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  const boundedIndex = Math.max(0, Math.min(sorted.length - 1, index));
  return Number(sorted[boundedIndex].toFixed(3));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Number((sum / values.length).toFixed(3));
}

function getThresholds(): PwaTelemetrySloThresholds {
  return {
    minSamples: parseNumberEnv('PWA_SLO_MIN_SAMPLES', 30, { min: 5, max: 1_000 }),
    lcpP75Ms: parseNumberEnv('PWA_SLO_LCP_P75_MS', 2_500, { min: 500, max: 10_000 }),
    inpP75Ms: parseNumberEnv('PWA_SLO_INP_P75_MS', 200, { min: 50, max: 2_000 }),
    clsP75: parseNumberEnv('PWA_SLO_CLS_P75', 0.1, { min: 0.01, max: 1 }),
    fcpP75Ms: parseNumberEnv('PWA_SLO_FCP_P75_MS', 1_800, { min: 500, max: 8_000 }),
    ttfbP75Ms: parseNumberEnv('PWA_SLO_TTFB_P75_MS', 800, { min: 100, max: 4_000 }),
    installAcceptRateMin: parseNumberEnv('PWA_SLO_INSTALL_ACCEPT_RATE_MIN', 0.2, { min: 0.01, max: 1 }),
    pushEnableRateMin: parseNumberEnv('PWA_SLO_PUSH_ENABLE_RATE_MIN', 0.25, { min: 0.01, max: 1 }),
    swRegistrationFailureRateMax: parseNumberEnv('PWA_SLO_SW_REGISTRATION_FAILURE_RATE_MAX', 0.05, {
      min: 0,
      max: 1,
    }),
    poorVitalsRateMax: parseNumberEnv('PWA_SLO_POOR_VITALS_RATE_MAX', 0.15, { min: 0, max: 1 }),
  };
}

function getVitalSummary(events: PwaTelemetryStoredEvent[], vitalName: VitalName): PwaTelemetryVitalSummary {
  const values: number[] = [];
  let good = 0;
  let needsImprovement = 0;
  let poor = 0;

  for (const event of events) {
    if (event.type !== 'web_vital' || event.name !== vitalName) {
      continue;
    }
    if (typeof event.value === 'number' && Number.isFinite(event.value)) {
      values.push(event.value);
    }
    if (event.rating === 'good') {
      good += 1;
    } else if (event.rating === 'needs-improvement') {
      needsImprovement += 1;
    } else if (event.rating === 'poor') {
      poor += 1;
    }
  }

  const count = values.length;
  return {
    count,
    p75: percentile(values, 75),
    p95: percentile(values, 95),
    average: average(values),
    poorRate: safeRate(poor, count),
    ratings: { good, needsImprovement, poor },
  };
}

function evaluateSlo(summary: Omit<PwaTelemetrySummary, 'alerts' | 'status'>): {
  alerts: PwaTelemetryAlert[];
  status: SloSeverity;
} {
  const alerts: PwaTelemetryAlert[] = [];
  const thresholds = summary.thresholds;

  function pushUpperBoundAlert(args: {
    key: string;
    label: string;
    value: number | null;
    target: number;
    sampleCount: number;
  }) {
    if (args.value === null || args.sampleCount < thresholds.minSamples) return;
    if (args.value <= args.target) return;
    const severity: SloSeverity = args.value <= args.target * 1.1 ? 'warn' : 'fail';
    alerts.push({
      key: args.key,
      label: args.label,
      severity,
      current: Number(args.value.toFixed(4)),
      target: Number(args.target.toFixed(4)),
      comparator: '<=',
    });
  }

  function pushLowerBoundAlert(args: {
    key: string;
    label: string;
    value: number | null;
    target: number;
    sampleCount: number;
  }) {
    if (args.value === null || args.sampleCount < thresholds.minSamples) return;
    if (args.value >= args.target) return;
    const severity: SloSeverity = args.value >= args.target * 0.9 ? 'warn' : 'fail';
    alerts.push({
      key: args.key,
      label: args.label,
      severity,
      current: Number(args.value.toFixed(4)),
      target: Number(args.target.toFixed(4)),
      comparator: '>=',
    });
  }

  pushUpperBoundAlert({
    key: 'lcp-p75',
    label: 'LCP p75',
    value: summary.webVitals.lcp.p75,
    target: thresholds.lcpP75Ms,
    sampleCount: summary.webVitals.lcp.count,
  });
  pushUpperBoundAlert({
    key: 'inp-p75',
    label: 'INP p75',
    value: summary.webVitals.inp.p75,
    target: thresholds.inpP75Ms,
    sampleCount: summary.webVitals.inp.count,
  });
  pushUpperBoundAlert({
    key: 'cls-p75',
    label: 'CLS p75',
    value: summary.webVitals.cls.p75,
    target: thresholds.clsP75,
    sampleCount: summary.webVitals.cls.count,
  });
  pushUpperBoundAlert({
    key: 'fcp-p75',
    label: 'FCP p75',
    value: summary.webVitals.fcp.p75,
    target: thresholds.fcpP75Ms,
    sampleCount: summary.webVitals.fcp.count,
  });
  pushUpperBoundAlert({
    key: 'ttfb-p75',
    label: 'TTFB p75',
    value: summary.webVitals.ttfb.p75,
    target: thresholds.ttfbP75Ms,
    sampleCount: summary.webVitals.ttfb.count,
  });
  pushUpperBoundAlert({
    key: 'poor-vitals-rate',
    label: 'Poor vitals rate',
    value: summary.totals.poorVitalsRate,
    target: thresholds.poorVitalsRateMax,
    sampleCount: summary.totals.webVitals,
  });
  pushLowerBoundAlert({
    key: 'install-accept-rate',
    label: 'Install accept rate',
    value: summary.funnels.install.acceptanceRate,
    target: thresholds.installAcceptRateMin,
    sampleCount: summary.funnels.install.shown,
  });
  pushLowerBoundAlert({
    key: 'push-enable-rate',
    label: 'Push enable rate',
    value: summary.funnels.push.enableRate,
    target: thresholds.pushEnableRateMin,
    sampleCount: summary.funnels.push.shown,
  });
  pushUpperBoundAlert({
    key: 'sw-registration-failure-rate',
    label: 'SW registration failure rate',
    value: summary.funnels.serviceWorker.failureRate,
    target: thresholds.swRegistrationFailureRateMax,
    sampleCount:
      summary.funnels.serviceWorker.registered + summary.funnels.serviceWorker.registrationFailed,
  });

  let status: SloSeverity = 'pass';
  if (alerts.some((alert) => alert.severity === 'fail')) {
    status = 'fail';
  } else if (alerts.some((alert) => alert.severity === 'warn')) {
    status = 'warn';
  }

  return { alerts, status };
}

function normalizeWindowMinutes(value: number): number {
  return Math.max(5, Math.min(24 * 60, Math.floor(value)));
}

export function normalizePwaTelemetryPath(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '/';
  if (!normalized.startsWith('/')) {
    return `/${normalized.slice(0, MAX_PATH - 1)}`;
  }
  return normalized.slice(0, MAX_PATH);
}

export function normalizePwaTelemetryName(value: string): string {
  return value.trim().slice(0, MAX_EVENT_NAME).toLowerCase();
}

export function normalizePwaTelemetryDisplayMode(
  value: string | undefined | null,
): PwaTelemetryDisplayMode {
  if (value === 'standalone' || value === 'browser' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

export function normalizePwaTelemetryEvent(
  event: PwaTelemetryIngestedEvent,
  context?: PwaTelemetryIngestedContext,
  now = Date.now(),
): PwaTelemetryStoredEvent | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const retentionCutoff = now - RETENTION_WINDOW_MS;
  const eventTs = Number.isFinite(event.ts) ? event.ts : now;
  if (eventTs < retentionCutoff || eventTs > now + 120_000) {
    return null;
  }

  const rating =
    event.rating === 'good' || event.rating === 'needs-improvement' || event.rating === 'poor'
      ? event.rating
      : null;

  return {
    type: event.type,
    name: normalizePwaTelemetryName(event.name),
    ts: eventTs,
    path: normalizePwaTelemetryPath(event.path),
    value: typeof event.value === 'number' && Number.isFinite(event.value) ? event.value : null,
    rating,
    displayMode: normalizePwaTelemetryDisplayMode(context?.displayMode),
  };
}

function pruneStore(now: number) {
  if (sharedStore.lastPrunedAt > now - 10_000 && sharedStore.events.length <= MAX_STORED_EVENTS) {
    return;
  }

  const retentionCutoff = now - RETENTION_WINDOW_MS;
  sharedStore.events = sharedStore.events.filter((event) => event.ts >= retentionCutoff);

  if (sharedStore.events.length > MAX_STORED_EVENTS) {
    const overflow = sharedStore.events.length - MAX_STORED_EVENTS;
    sharedStore.events.splice(0, overflow);
  }

  sharedStore.lastPrunedAt = now;
}

export function recordPwaTelemetryBatch(
  events: PwaTelemetryIngestedEvent[],
  context?: PwaTelemetryIngestedContext,
) {
  const now = Date.now();
  for (const event of events) {
    const normalized = normalizePwaTelemetryEvent(event, context, now);
    if (!normalized) continue;
    sharedStore.events.push(normalized);
  }
  pruneStore(now);
}

export function summarizePwaTelemetryEvents(
  events: PwaTelemetryStoredEvent[],
  options: PwaTelemetrySummaryOptions,
  now = Date.now(),
): PwaTelemetrySummary {
  const windowMinutes = normalizeWindowMinutes(options.windowMinutes);
  const windowStart = now - windowMinutes * 60 * 1000;
  const pathPrefix = options.pathPrefix?.trim() ? normalizePwaTelemetryPath(options.pathPrefix) : null;
  const thresholds = getThresholds();

  const filtered = events.filter((event) => {
    if (event.ts < windowStart) return false;
    if (options.displayMode !== 'all' && event.displayMode !== options.displayMode) return false;
    if (pathPrefix && !event.path.startsWith(pathPrefix)) return false;
    return true;
  });

  const lifecycleCounts: PwaLifecycleCounts = {};
  let webVitalsCount = 0;
  let lifecycleCount = 0;
  let poorWebVitalsCount = 0;
  let ratedWebVitalsCount = 0;
  let browserCount = 0;
  let standaloneCount = 0;
  let unknownCount = 0;

  for (const event of filtered) {
    if (event.displayMode === 'browser') browserCount += 1;
    else if (event.displayMode === 'standalone') standaloneCount += 1;
    else unknownCount += 1;

    if (event.type === 'web_vital') {
      webVitalsCount += 1;
      if (event.rating === 'good' || event.rating === 'needs-improvement' || event.rating === 'poor') {
        ratedWebVitalsCount += 1;
      }
      if (event.rating === 'poor') {
        poorWebVitalsCount += 1;
      }
    } else if (event.type === 'pwa_lifecycle') {
      lifecycleCount += 1;
      lifecycleCounts[event.name] = (lifecycleCounts[event.name] ?? 0) + 1;
    }
  }

  const webVitals = {
    lcp: getVitalSummary(filtered, 'lcp'),
    inp: getVitalSummary(filtered, 'inp'),
    cls: getVitalSummary(filtered, 'cls'),
    fcp: getVitalSummary(filtered, 'fcp'),
    ttfb: getVitalSummary(filtered, 'ttfb'),
  };

  const installShown = lifecycleCounts.install_prompt_shown ?? 0;
  const installAccepted = lifecycleCounts.install_accepted ?? 0;
  const installDismissed = lifecycleCounts.install_dismissed ?? 0;
  const pushShown = lifecycleCounts.push_prompt_shown ?? 0;
  const pushEnabled = lifecycleCounts.push_enabled ?? 0;
  const pushDismissed = lifecycleCounts.push_dismissed ?? 0;
  const pushDenied = lifecycleCounts.push_permission_denied ?? 0;
  const pushFailed = lifecycleCounts.push_enable_failed ?? 0;
  const swRegistered = lifecycleCounts.sw_registered ?? 0;
  const swRegistrationFailed = lifecycleCounts.sw_registration_failed ?? 0;

  const summaryWithoutAlerts = {
    generatedAt: new Date(now).toISOString(),
    windowMinutes,
    filter: {
      displayMode: options.displayMode,
      pathPrefix,
    },
    totals: {
      events: filtered.length,
      webVitals: webVitalsCount,
      lifecycle: lifecycleCount,
      eventsPerMinute: Number((filtered.length / windowMinutes).toFixed(2)),
      poorVitalsRate: safeRate(poorWebVitalsCount, ratedWebVitalsCount),
    },
    displayModeBreakdown: {
      browser: browserCount,
      standalone: standaloneCount,
      unknown: unknownCount,
    },
    webVitals,
    lifecycle: lifecycleCounts,
    funnels: {
      install: {
        shown: installShown,
        accepted: installAccepted,
        dismissed: installDismissed,
        acceptanceRate: safeRate(installAccepted, installShown),
      },
      push: {
        shown: pushShown,
        enabled: pushEnabled,
        dismissed: pushDismissed,
        denied: pushDenied,
        failed: pushFailed,
        enableRate: safeRate(pushEnabled, pushShown),
      },
      serviceWorker: {
        registered: swRegistered,
        registrationFailed: swRegistrationFailed,
        failureRate: safeRate(swRegistrationFailed, swRegistered + swRegistrationFailed),
      },
    },
    thresholds,
  };

  const { alerts, status } = evaluateSlo(summaryWithoutAlerts);

  return {
    ...summaryWithoutAlerts,
    alerts,
    status,
  };
}

export function getPwaTelemetrySummary(options: PwaTelemetrySummaryOptions): PwaTelemetrySummary {
  const now = Date.now();
  pruneStore(now);
  return summarizePwaTelemetryEvents(sharedStore.events, options, now);
}
