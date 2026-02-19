#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
    '  node tools/scripts/pwa-incident-rehearsal.mjs --base-url <url> --alert-secret <secret> [options]',
    '',
    'Options:',
    '  --window-minutes <5-1440>         default 60',
    '  --timeout-ms <1000-60000>         default 12000',
    '  --trigger-alert-probe <true|false>  default false (may dispatch real alerts)',
    '  --output-file <path>              default .tmp/pwa-incident-rehearsal/latest.json',
    '  --help',
    '',
    'Env fallbacks:',
    '  PWA_GOVERNANCE_BASE_URL',
    '  PWA_BURN_IN_BASE_URL',
    '  PWA_SLO_ALERT_SECRET',
    '  PWA_INCIDENT_REHEARSAL_OUTPUT',
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

function nowIso() {
  return new Date().toISOString();
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    return { ok: true, response, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

function addStep(steps, step) {
  steps.push(step);
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

  const windowMinutes = toInteger(args['window-minutes'], 60, { min: 5, max: 24 * 60 });
  const timeoutMs = toInteger(args['timeout-ms'], 12_000, { min: 1_000, max: 60_000 });
  const triggerAlertProbe = toBoolean(args['trigger-alert-probe'], false);
  const outputFile = args['output-file']
    ?? process.env.PWA_INCIDENT_REHEARSAL_OUTPUT
    ?? '.tmp/pwa-incident-rehearsal/latest.json';

  const steps = [];
  const rolloutStatusUrl = `${baseUrl}/api/internal/pwa/rollout-status?windowMinutes=${windowMinutes}&dispatchLimit=10`;
  const alertsUrl = `${baseUrl}/api/internal/pwa/slo-alerts`;

  const unauthRollout = await fetchWithTimeout(rolloutStatusUrl, timeoutMs, { method: 'GET' });
  if (!unauthRollout.ok) {
    addStep(steps, {
      name: 'rollout_status_unauthorized',
      status: 'fail',
      latencyMs: unauthRollout.latencyMs,
      detail: `request_error=${unauthRollout.error}`,
    });
  } else {
    const status = unauthRollout.response.status;
    addStep(steps, {
      name: 'rollout_status_unauthorized',
      status: status === 401 || status === 503 ? 'pass' : 'fail',
      latencyMs: unauthRollout.latencyMs,
      detail: `http_status=${status}`,
    });
  }

  const unauthAlerts = await fetchWithTimeout(alertsUrl, timeoutMs, { method: 'GET' });
  if (!unauthAlerts.ok) {
    addStep(steps, {
      name: 'alerts_endpoint_unauthorized',
      status: 'fail',
      latencyMs: unauthAlerts.latencyMs,
      detail: `request_error=${unauthAlerts.error}`,
    });
  } else {
    const status = unauthAlerts.response.status;
    addStep(steps, {
      name: 'alerts_endpoint_unauthorized',
      status: status === 401 || status === 503 ? 'pass' : 'fail',
      latencyMs: unauthAlerts.latencyMs,
      detail: `http_status=${status}`,
    });
  }

  let rolloutPayload = null;
  const authRollout = await fetchWithTimeout(rolloutStatusUrl, timeoutMs, {
    method: 'GET',
    headers: { authorization: `Bearer ${alertSecret}` },
  });

  if (!authRollout.ok) {
    addStep(steps, {
      name: 'rollout_status_authorized',
      status: 'fail',
      latencyMs: authRollout.latencyMs,
      detail: `request_error=${authRollout.error}`,
    });
  } else {
    rolloutPayload = await authRollout.response.json().catch(() => null);
    const isPass = authRollout.response.ok && rolloutPayload?.ok === true;
    addStep(steps, {
      name: 'rollout_status_authorized',
      status: isPass ? 'pass' : 'fail',
      latencyMs: authRollout.latencyMs,
      detail: isPass
        ? `summary_status=${rolloutPayload?.summary?.status ?? 'unknown'} source=${rolloutPayload?.source ?? 'unknown'}`
        : `http_status=${authRollout.response.status}`,
    });
  }

  if (triggerAlertProbe) {
    const alertProbe = await fetchWithTimeout(`${alertsUrl}?force=true&windowMinutes=${windowMinutes}`, timeoutMs, {
      method: 'POST',
      headers: { authorization: `Bearer ${alertSecret}` },
    });
    if (!alertProbe.ok) {
      addStep(steps, {
        name: 'alert_probe_force_dispatch',
        status: 'fail',
        latencyMs: alertProbe.latencyMs,
        detail: `request_error=${alertProbe.error}`,
      });
    } else {
      const payload = await alertProbe.response.json().catch(() => null);
      const status = alertProbe.response.status;
      const ok = alertProbe.response.ok && payload?.ok === true;
      addStep(steps, {
        name: 'alert_probe_force_dispatch',
        status: ok ? 'pass' : 'fail',
        latencyMs: alertProbe.latencyMs,
        detail: ok
          ? `result_status=${payload?.result?.status ?? 'unknown'}`
          : `http_status=${status}`,
      });
    }
  } else {
    addStep(steps, {
      name: 'alert_probe_force_dispatch',
      status: 'skipped',
      latencyMs: 0,
      detail: 'skipped_by_configuration',
    });
  }

  const failedSteps = steps.filter((step) => step.status === 'fail');
  const report = {
    executedAt: nowIso(),
    baseUrl,
    windowMinutes,
    timeoutMs,
    triggerAlertProbe,
    outcome: failedSteps.length > 0 ? 'fail' : 'pass',
    steps,
    snapshot: rolloutPayload
      ? {
          source: rolloutPayload.source ?? 'unknown',
          summaryStatus: rolloutPayload?.summary?.status ?? 'unknown',
          alertCount: Array.isArray(rolloutPayload?.summary?.alerts)
            ? rolloutPayload.summary.alerts.length
            : null,
          rolloutPercent: rolloutPayload?.config?.rolloutPercent ?? null,
        }
      : null,
    rollbackCommands: {
      disablePwa: 'Set NEXT_PUBLIC_PWA_ENABLED=false and redeploy.',
      burnInCheck: `npm run pwa:burn-in-check -- --base-url "${baseUrl}" --alert-secret "<secret>"`,
    },
  };

  const absoluteOutputFile = path.resolve(outputFile);
  await mkdir(path.dirname(absoluteOutputFile), { recursive: true });
  await writeFile(absoluteOutputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('PWA incident rehearsal report');
  console.log(`- Outcome: ${report.outcome.toUpperCase()}`);
  console.log(`- Base URL: ${baseUrl}`);
  console.log(`- Output file: ${path.relative(process.cwd(), absoluteOutputFile)}`);
  for (const step of steps) {
    console.log(`- [${String(step.status).toUpperCase()}] ${step.name}: ${step.detail}`);
  }

  if (report.outcome === 'fail') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pwa-incident-rehearsal error: ${message}`);
  process.exit(1);
});
