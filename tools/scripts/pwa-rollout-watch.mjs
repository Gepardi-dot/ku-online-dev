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
    '  node tools/scripts/pwa-rollout-watch.mjs --base-url <url> --alert-secret <secret> [options]',
    '',
    'Options:',
    '  --window-minutes <5-1440>          Summary window, default 60',
    '  --display-mode <all|browser|standalone|unknown>  default all',
    '  --path-prefix </path>              Optional path filter',
    '  --interval-sec <seconds>           Poll interval, default 60',
    '  --cycles <count>                   Poll count, default 30',
    '  --max-consecutive-fail <count>     Abort threshold, default 2',
    '  --timeout-ms <1000-60000>          HTTP timeout, default 12000',
    '  --help',
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function nowIso() {
  return new Date().toISOString();
}

function printHeader(options) {
  console.log('PWA rollout live watch');
  console.log(`- Base URL: ${options.baseUrl}`);
  console.log(`- Window: ${options.windowMinutes}m`);
  console.log(`- Display mode: ${options.displayMode}`);
  console.log(`- Path prefix: ${options.pathPrefix ?? '<none>'}`);
  console.log(`- Interval: ${options.intervalSec}s`);
  console.log(`- Cycles: ${options.cycles}`);
  console.log(`- Max consecutive fail: ${options.maxConsecutiveFail}`);
}

function printSample(index, total, payload) {
  const summaryStatus = payload?.summary?.status ?? 'unknown';
  const source = payload?.source ?? 'unknown';
  const rolloutPercent = payload?.config?.rolloutPercent ?? 'unknown';
  const alerts = Array.isArray(payload?.summary?.alerts) ? payload.summary.alerts.length : 'n/a';
  const dispatches = Array.isArray(payload?.recentDispatches) ? payload.recentDispatches.length : 'n/a';
  const poorRate = payload?.summary?.totals?.poorVitalsRate;
  const poorRateText =
    typeof poorRate === 'number' && Number.isFinite(poorRate) ? `${(poorRate * 100).toFixed(1)}%` : 'n/a';

  console.log(
    `[${nowIso()}] sample ${index}/${total} summary=${summaryStatus} source=${source} alerts=${alerts} poorRate=${poorRateText} rolloutPercent=${rolloutPercent} dispatches=${dispatches}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true' || args.h === 'true') {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(args['base-url'] ?? process.env.PWA_BURN_IN_BASE_URL);
  const alertSecret = (args['alert-secret'] ?? process.env.PWA_SLO_ALERT_SECRET ?? '').trim();
  if (!baseUrl) {
    throw new Error('Missing/invalid base URL. Provide --base-url or PWA_BURN_IN_BASE_URL.');
  }
  if (!alertSecret) {
    throw new Error('Missing alert secret. Provide --alert-secret or PWA_SLO_ALERT_SECRET.');
  }

  const windowMinutes = toInteger(args['window-minutes'], 60, { min: 5, max: 24 * 60 });
  const displayMode = normalizeDisplayMode(args['display-mode'] ?? 'all');
  const pathPrefix = normalizePathPrefix(args['path-prefix'] ?? null);
  const intervalSec = toInteger(args['interval-sec'], 60, { min: 10, max: 3600 });
  const cycles = toInteger(args.cycles, 30, { min: 1, max: 10000 });
  const maxConsecutiveFail = toInteger(args['max-consecutive-fail'], 2, { min: 1, max: 100 });
  const timeoutMs = toInteger(args['timeout-ms'], 12_000, { min: 1_000, max: 60_000 });

  printHeader({
    baseUrl,
    windowMinutes,
    displayMode,
    pathPrefix,
    intervalSec,
    cycles,
    maxConsecutiveFail,
  });

  let consecutiveFail = 0;
  let failCount = 0;
  let warnCount = 0;
  let passCount = 0;

  for (let index = 1; index <= cycles; index += 1) {
    const params = new URLSearchParams({
      windowMinutes: String(windowMinutes),
      displayMode,
      dispatchLimit: '10',
    });
    if (pathPrefix) {
      params.set('pathPrefix', pathPrefix);
    }

    const url = `${baseUrl}/api/internal/pwa/rollout-status?${params.toString()}`;
    const result = await fetchWithTimeout(url, timeoutMs, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${alertSecret}`,
      },
    });

    if (!result.ok) {
      consecutiveFail += 1;
      failCount += 1;
      console.error(`[${nowIso()}] sample ${index}/${cycles} request_error=${result.error}`);
    } else {
      const response = result.response;
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        consecutiveFail += 1;
        failCount += 1;
        const message = payload?.error ?? `HTTP ${response.status}`;
        console.error(`[${nowIso()}] sample ${index}/${cycles} endpoint_error=${message}`);
      } else {
        const status = payload.summary?.status ?? 'unknown';
        printSample(index, cycles, payload);

        if (status === 'fail') {
          consecutiveFail += 1;
          failCount += 1;
        } else {
          consecutiveFail = 0;
          if (status === 'warn') {
            warnCount += 1;
          } else {
            passCount += 1;
          }
        }
      }
    }

    if (consecutiveFail >= maxConsecutiveFail) {
      throw new Error(
        `Aborting: ${consecutiveFail} consecutive fail samples reached threshold (${maxConsecutiveFail}).`,
      );
    }

    if (index < cycles) {
      await sleep(intervalSec * 1000);
    }
  }

  console.log(
    `Live watch complete. pass=${passCount}, warn=${warnCount}, fail=${failCount}, threshold=${maxConsecutiveFail}.`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pwa-rollout-watch error: ${message}`);
  process.exit(1);
});
