#!/usr/bin/env node

function parseArgs(argv) {
  const args = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      i += 1;
      continue;
    }

    args[key] = next;
    i += 2;
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node tools/scripts/pwa-ramp-governance.mjs --base-url <url> --alert-secret <secret> [options]',
    '',
    'Options:',
    '  --window-minutes <5-1440>              default 60',
    '  --display-mode <all|browser|standalone|unknown>  default all',
    '  --path-prefix </path>                  optional',
    '  --dispatch-limit <1-50>                default 20',
    '  --timeout-ms <1000-60000>              default 12000',
    '  --allow-warn <true|false>              default false',
    '  --fail-on-warn <true|false>            default false',
    '  --require-durable <true|false>         default true',
    '  --expected-rollout-percent <0-100>     optional',
    '  --max-alert-count <0+>                 default 0',
    '  --max-poor-vitals-rate <0-1>           default 0.15',
    '  --max-sw-failure-rate <0-1>            default 0.05',
    '  --max-dispatch-failures <0+>           default 0',
    '  --min-events <0+>                      default 0',
    '  --output-json',
    '  --help',
    '',
    'Env fallbacks:',
    '  PWA_GOVERNANCE_BASE_URL',
    '  PWA_SLO_ALERT_SECRET',
    '  PWA_GOVERNANCE_WINDOW_MINUTES',
    '  PWA_GOVERNANCE_DISPLAY_MODE',
    '  PWA_GOVERNANCE_PATH_PREFIX',
    '  PWA_GOVERNANCE_DISPATCH_LIMIT',
    '  PWA_GOVERNANCE_TIMEOUT_MS',
    '  PWA_GOVERNANCE_ALLOW_WARN',
    '  PWA_GOVERNANCE_FAIL_ON_WARN',
    '  PWA_GOVERNANCE_REQUIRE_DURABLE',
    '  PWA_GOVERNANCE_EXPECTED_ROLLOUT_PERCENT',
    '  PWA_GOVERNANCE_MAX_ALERT_COUNT',
    '  PWA_GOVERNANCE_MAX_POOR_VITALS_RATE',
    '  PWA_GOVERNANCE_MAX_SW_FAILURE_RATE',
    '  PWA_GOVERNANCE_MAX_DISPATCH_FAILURES',
    '  PWA_GOVERNANCE_MIN_EVENTS',
  ].join('\n');
}

function toInteger(value, fallback, options = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (typeof options.min === 'number' && floored < options.min) return fallback;
  if (typeof options.max === 'number' && floored > options.max) return fallback;
  return floored;
}

function toFloat(value, fallback, options = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof options.min === 'number' && parsed < options.min) return fallback;
  if (typeof options.max === 'number' && parsed > options.max) return fallback;
  return parsed;
}

function toBoolean(value, fallback = false) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function normalizeBaseUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    return new URL(raw).origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function normalizeDisplayMode(value) {
  if (value === 'browser' || value === 'standalone' || value === 'unknown') {
    return value;
  }
  return 'all';
}

function normalizePathPrefix(value) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 180) return normalized.slice(0, 180);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function formatRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(2)}%`;
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    return { ok: true, response };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function addFinding(findings, severity, code, message) {
  findings.push({ severity, code, message });
}

function evaluateGate(payload, thresholds) {
  const findings = [];
  const summary = payload?.summary ?? null;
  const totals = summary?.totals ?? null;
  const funnels = summary?.funnels ?? null;
  const alerts = Array.isArray(summary?.alerts) ? summary.alerts : [];
  const summaryStatus = summary?.status ?? 'unknown';
  const source = payload?.source ?? 'unknown';
  const rolloutPercent = payload?.config?.rolloutPercent;
  const durableEnabled = Boolean(payload?.durableEnabled);
  const dispatchesUnavailable = Boolean(payload?.dispatchesUnavailable);
  const recentDispatches = Array.isArray(payload?.recentDispatches) ? payload.recentDispatches : [];

  if (summaryStatus === 'fail') {
    addFinding(findings, 'fail', 'summary_fail', 'Summary status is fail.');
  } else if (summaryStatus === 'warn') {
    if (thresholds.allowWarn) {
      addFinding(findings, 'warn', 'summary_warn_allowed', 'Summary status is warn (allowed).');
    } else {
      addFinding(findings, 'fail', 'summary_warn_blocked', 'Summary status is warn (blocked).');
    }
  } else if (summaryStatus !== 'pass') {
    addFinding(findings, 'fail', 'summary_unknown', `Summary status is unknown (${summaryStatus}).`);
  } else {
    addFinding(findings, 'pass', 'summary_pass', 'Summary status is pass.');
  }

  if (thresholds.requireDurable) {
    if (!durableEnabled) {
      addFinding(findings, 'fail', 'durable_disabled', 'Durable telemetry is disabled.');
    } else if (source !== 'durable') {
      addFinding(findings, 'fail', 'durable_source_missing', `Telemetry source is ${source}, expected durable.`);
    } else {
      addFinding(findings, 'pass', 'durable_ok', 'Durable telemetry source is active.');
    }
  }

  if (typeof thresholds.expectedRolloutPercent === 'number') {
    if (rolloutPercent !== thresholds.expectedRolloutPercent) {
      addFinding(
        findings,
        'fail',
        'rollout_percent_mismatch',
        `Rollout percent mismatch: actual=${rolloutPercent}, expected=${thresholds.expectedRolloutPercent}.`,
      );
    } else {
      addFinding(
        findings,
        'pass',
        'rollout_percent_match',
        `Rollout percent matches expected ${thresholds.expectedRolloutPercent}.`,
      );
    }
  }

  if (alerts.length > thresholds.maxAlertCount) {
    addFinding(
      findings,
      'fail',
      'alert_count_exceeded',
      `Active alerts ${alerts.length} exceeded max ${thresholds.maxAlertCount}.`,
    );
  } else {
    addFinding(
      findings,
      'pass',
      'alert_count_ok',
      `Active alerts ${alerts.length} within max ${thresholds.maxAlertCount}.`,
    );
  }

  const poorRate = totals?.poorVitalsRate;
  if (typeof poorRate === 'number' && Number.isFinite(poorRate)) {
    if (poorRate > thresholds.maxPoorVitalsRate) {
      addFinding(
        findings,
        'fail',
        'poor_vitals_rate_exceeded',
        `Poor vitals rate ${formatRate(poorRate)} exceeded max ${formatRate(thresholds.maxPoorVitalsRate)}.`,
      );
    } else {
      addFinding(
        findings,
        'pass',
        'poor_vitals_rate_ok',
        `Poor vitals rate ${formatRate(poorRate)} within max ${formatRate(thresholds.maxPoorVitalsRate)}.`,
      );
    }
  } else {
    addFinding(findings, 'warn', 'poor_vitals_rate_missing', 'Poor vitals rate is unavailable.');
  }

  const swFailureRate = funnels?.serviceWorker?.failureRate;
  if (typeof swFailureRate === 'number' && Number.isFinite(swFailureRate)) {
    if (swFailureRate > thresholds.maxSwFailureRate) {
      addFinding(
        findings,
        'fail',
        'sw_failure_rate_exceeded',
        `SW failure rate ${formatRate(swFailureRate)} exceeded max ${formatRate(thresholds.maxSwFailureRate)}.`,
      );
    } else {
      addFinding(
        findings,
        'pass',
        'sw_failure_rate_ok',
        `SW failure rate ${formatRate(swFailureRate)} within max ${formatRate(thresholds.maxSwFailureRate)}.`,
      );
    }
  } else {
    addFinding(findings, 'warn', 'sw_failure_rate_missing', 'SW failure rate is unavailable.');
  }

  const totalEvents = totals?.events;
  if (typeof totalEvents === 'number' && Number.isFinite(totalEvents)) {
    if (totalEvents < thresholds.minEvents) {
      addFinding(
        findings,
        'warn',
        'event_volume_low',
        `Event volume ${totalEvents} below minimum ${thresholds.minEvents}.`,
      );
    } else {
      addFinding(
        findings,
        'pass',
        'event_volume_ok',
        `Event volume ${totalEvents} meets minimum ${thresholds.minEvents}.`,
      );
    }
  } else {
    addFinding(findings, 'warn', 'event_volume_missing', 'Event volume is unavailable.');
  }

  if (dispatchesUnavailable) {
    addFinding(findings, 'fail', 'dispatches_unavailable', 'Recent dispatches are unavailable.');
  } else {
    const failedDispatches = recentDispatches.filter(
      (dispatch) => dispatch?.deliveryStatus === 'failed',
    ).length;
    if (failedDispatches > thresholds.maxDispatchFailures) {
      addFinding(
        findings,
        'fail',
        'dispatch_failures_exceeded',
        `Failed dispatches ${failedDispatches} exceeded max ${thresholds.maxDispatchFailures}.`,
      );
    } else {
      addFinding(
        findings,
        'pass',
        'dispatch_failures_ok',
        `Failed dispatches ${failedDispatches} within max ${thresholds.maxDispatchFailures}.`,
      );
    }
  }

  const failCount = findings.filter((finding) => finding.severity === 'fail').length;
  const warnCount = findings.filter((finding) => finding.severity === 'warn').length;
  const passCount = findings.filter((finding) => finding.severity === 'pass').length;

  let gateStatus = 'pass';
  if (failCount > 0) {
    gateStatus = 'fail';
  } else if (warnCount > 0 && thresholds.failOnWarn) {
    gateStatus = 'fail';
  } else if (warnCount > 0) {
    gateStatus = 'warn';
  }

  return {
    gateStatus,
    failCount,
    warnCount,
    passCount,
    findings,
  };
}

function printResult(result) {
  console.log('PWA ramp governance report');
  console.log(`- Observed at: ${result.observedAt}`);
  console.log(`- Base URL: ${result.baseUrl}`);
  console.log(`- Endpoint: ${result.endpoint}`);
  console.log(`- Gate status: ${result.gateStatus.toUpperCase()}`);
  console.log(`- Findings: pass=${result.passCount}, warn=${result.warnCount}, fail=${result.failCount}`);
  console.log(`- Summary status: ${result.summaryStatus}`);
  console.log(`- Source: ${result.source}`);
  console.log(`- Rollout percent: ${result.rolloutPercent}`);
  console.log(`- Active alerts: ${result.alertCount}`);
  console.log(`- Poor vitals rate: ${formatRate(result.poorVitalsRate)}`);
  console.log(`- SW failure rate: ${formatRate(result.swFailureRate)}`);

  for (const finding of result.findings) {
    console.log(`- [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true' || args.h === 'true') {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(
    args['base-url']
      ?? process.env.PWA_GOVERNANCE_BASE_URL
      ?? process.env.PWA_BURN_IN_BASE_URL
      ?? process.env.NEXT_PUBLIC_SITE_URL,
  );
  const alertSecret = (args['alert-secret'] ?? process.env.PWA_SLO_ALERT_SECRET ?? '').trim();
  if (!baseUrl) {
    throw new Error('Missing/invalid base URL. Provide --base-url or PWA_GOVERNANCE_BASE_URL.');
  }
  if (!alertSecret) {
    throw new Error('Missing alert secret. Provide --alert-secret or PWA_SLO_ALERT_SECRET.');
  }

  const windowMinutes = toInteger(
    args['window-minutes'] ?? process.env.PWA_GOVERNANCE_WINDOW_MINUTES,
    60,
    { min: 5, max: 24 * 60 },
  );
  const displayMode = normalizeDisplayMode(
    args['display-mode'] ?? process.env.PWA_GOVERNANCE_DISPLAY_MODE ?? 'all',
  );
  const pathPrefix = normalizePathPrefix(args['path-prefix'] ?? process.env.PWA_GOVERNANCE_PATH_PREFIX ?? null);
  const dispatchLimit = toInteger(
    args['dispatch-limit'] ?? process.env.PWA_GOVERNANCE_DISPATCH_LIMIT,
    20,
    { min: 1, max: 50 },
  );
  const timeoutMs = toInteger(
    args['timeout-ms'] ?? process.env.PWA_GOVERNANCE_TIMEOUT_MS,
    12_000,
    { min: 1_000, max: 60_000 },
  );
  const allowWarn = toBoolean(
    args['allow-warn'] ?? process.env.PWA_GOVERNANCE_ALLOW_WARN,
    false,
  );
  const failOnWarn = toBoolean(
    args['fail-on-warn'] ?? process.env.PWA_GOVERNANCE_FAIL_ON_WARN,
    false,
  );
  const requireDurable = toBoolean(
    args['require-durable'] ?? process.env.PWA_GOVERNANCE_REQUIRE_DURABLE,
    true,
  );
  const expectedRolloutPercentRaw =
    args['expected-rollout-percent'] ?? process.env.PWA_GOVERNANCE_EXPECTED_ROLLOUT_PERCENT;
  const expectedRolloutPercent =
    typeof expectedRolloutPercentRaw === 'string' && expectedRolloutPercentRaw.trim().length > 0
      ? toInteger(expectedRolloutPercentRaw, -1, { min: 0, max: 100 })
      : null;
  const maxAlertCount = toInteger(
    args['max-alert-count'] ?? process.env.PWA_GOVERNANCE_MAX_ALERT_COUNT,
    0,
    { min: 0, max: 1_000 },
  );
  const maxPoorVitalsRate = toFloat(
    args['max-poor-vitals-rate'] ?? process.env.PWA_GOVERNANCE_MAX_POOR_VITALS_RATE,
    0.15,
    { min: 0, max: 1 },
  );
  const maxSwFailureRate = toFloat(
    args['max-sw-failure-rate'] ?? process.env.PWA_GOVERNANCE_MAX_SW_FAILURE_RATE,
    0.05,
    { min: 0, max: 1 },
  );
  const maxDispatchFailures = toInteger(
    args['max-dispatch-failures'] ?? process.env.PWA_GOVERNANCE_MAX_DISPATCH_FAILURES,
    0,
    { min: 0, max: 1_000 },
  );
  const minEvents = toInteger(
    args['min-events'] ?? process.env.PWA_GOVERNANCE_MIN_EVENTS,
    0,
    { min: 0, max: 1_000_000 },
  );
  const outputJson = args['output-json'] === 'true';

  const params = new URLSearchParams({
    windowMinutes: String(windowMinutes),
    displayMode,
    dispatchLimit: String(dispatchLimit),
  });
  if (pathPrefix) {
    params.set('pathPrefix', pathPrefix);
  }

  const endpoint = `${baseUrl}/api/internal/pwa/rollout-status?${params.toString()}`;
  const result = await fetchWithTimeout(endpoint, timeoutMs, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${alertSecret}`,
    },
  });

  if (!result.ok) {
    throw new Error(`Rollout status request failed: ${result.error}`);
  }

  const response = result.response;
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    const message = payload?.error ?? `HTTP ${response.status}`;
    throw new Error(`Rollout status endpoint returned non-OK: ${message}`);
  }

  const thresholds = {
    allowWarn,
    failOnWarn,
    requireDurable,
    expectedRolloutPercent: expectedRolloutPercent === -1 ? null : expectedRolloutPercent,
    maxAlertCount,
    maxPoorVitalsRate,
    maxSwFailureRate,
    maxDispatchFailures,
    minEvents,
  };

  const evaluation = evaluateGate(payload, thresholds);
  const summary = payload.summary ?? {};
  const report = {
    observedAt: new Date().toISOString(),
    baseUrl,
    endpoint,
    gateStatus: evaluation.gateStatus,
    passCount: evaluation.passCount,
    warnCount: evaluation.warnCount,
    failCount: evaluation.failCount,
    findings: evaluation.findings,
    thresholds,
    summaryStatus: summary.status ?? 'unknown',
    source: payload.source ?? 'unknown',
    rolloutPercent: payload?.config?.rolloutPercent ?? null,
    alertCount: Array.isArray(summary.alerts) ? summary.alerts.length : null,
    poorVitalsRate: summary?.totals?.poorVitalsRate ?? null,
    swFailureRate: summary?.funnels?.serviceWorker?.failureRate ?? null,
  };

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printResult(report);
  }

  if (report.gateStatus === 'fail') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pwa-ramp-governance error: ${message}`);
  process.exit(1);
});
