#!/usr/bin/env node

function toBoolean(value, fallback = false) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function toInteger(value, fallback, options = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (typeof options.min === 'number' && floored < options.min) return fallback;
  if (typeof options.max === 'number' && floored > options.max) return fallback;
  return floored;
}

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
    '  node tools/scripts/pwa-burn-in-check.mjs [--base-url <url>] [--alert-secret <secret>] [--timeout-ms <ms>] [--require-alert-success <true|false>]',
    '',
    'Env fallbacks:',
    '  PWA_BURN_IN_BASE_URL',
    '  PWA_SLO_ALERT_SECRET',
    '  PWA_BURN_IN_TIMEOUT_MS (default: 10000)',
    '  PWA_BURN_IN_REQUIRE_ALERT_SUCCESS (default: false)',
  ].join('\n');
}

function normalizeBaseUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
    return {
      ok: true,
      response,
      latencyMs: Date.now() - startedAt,
    };
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

function summarizeResults(results) {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const result of results) {
    counts[result.status] += 1;
  }
  return counts;
}

function printResults(baseUrl, timeoutMs, requireAlertSuccess, results) {
  const counts = summarizeResults(results);
  console.log('PWA burn-in report');
  console.log(`- Base URL: ${baseUrl}`);
  console.log(`- Timeout: ${timeoutMs}ms`);
  console.log(`- Require alert success: ${requireAlertSuccess ? 'true' : 'false'}`);

  for (const result of results) {
    const latency = typeof result.latencyMs === 'number' ? ` (${result.latencyMs}ms)` : '';
    console.log(`- [${result.status.toUpperCase()}] ${result.name}${latency}: ${result.detail}`);
  }

  console.log(`- Summary: pass=${counts.pass}, warn=${counts.warn}, fail=${counts.fail}`);
}

function readTextSafe(response) {
  return response.text().catch(() => '');
}

function readJsonSafe(response) {
  return response.json().catch(() => null);
}

async function runChecks(options) {
  const results = [];
  const {
    baseUrl,
    alertSecret,
    timeoutMs,
    requireAlertSuccess,
  } = options;

  {
    const url = `${baseUrl}/api/health`;
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      results.push({
        name: 'Health endpoint',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: response.error,
      });
    } else if (!response.response.ok) {
      results.push({
        name: 'Health endpoint',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: `Unexpected status ${response.response.status}`,
      });
    } else {
      results.push({
        name: 'Health endpoint',
        status: 'pass',
        latencyMs: response.latencyMs,
        detail: `HTTP ${response.response.status}`,
      });
    }
  }

  {
    const url = `${baseUrl}/manifest.webmanifest`;
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      results.push({
        name: 'Manifest endpoint',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: response.error,
      });
    } else if (!response.response.ok) {
      results.push({
        name: 'Manifest endpoint',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: `Unexpected status ${response.response.status}`,
      });
    } else {
      const manifest = await readJsonSafe(response.response);
      const hasIcons = Array.isArray(manifest?.icons)
        && manifest.icons.some((icon) => icon?.sizes === '192x192')
        && manifest.icons.some((icon) => icon?.sizes === '512x512');
      const display = manifest?.display;
      if (display !== 'standalone' || !hasIcons) {
        results.push({
          name: 'Manifest endpoint',
          status: 'fail',
          latencyMs: response.latencyMs,
          detail: 'Manifest missing required installability fields',
        });
      } else {
        results.push({
          name: 'Manifest endpoint',
          status: 'pass',
          latencyMs: response.latencyMs,
          detail: 'Installability fields are present',
        });
      }
    }
  }

  {
    const url = `${baseUrl}/sw.js`;
    let response = await fetchWithTimeout(url, timeoutMs, { method: 'HEAD' });
    if (response.ok && response.response.status === 405) {
      response = await fetchWithTimeout(url, timeoutMs, { method: 'GET' });
    }

    if (!response.ok) {
      results.push({
        name: 'Service worker endpoint',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: response.error,
      });
    } else if (!response.response.ok) {
      results.push({
        name: 'Service worker endpoint',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: `Unexpected status ${response.response.status}`,
      });
    } else {
      const cacheControl = response.response.headers.get('cache-control') ?? '';
      const swAllowed = response.response.headers.get('service-worker-allowed') ?? '';
      const hasNoCache = cacheControl.toLowerCase().includes('no-cache');
      const hasScopeHeader = swAllowed.trim() === '/';
      if (!hasNoCache || !hasScopeHeader) {
        results.push({
          name: 'Service worker endpoint',
          status: 'warn',
          latencyMs: response.latencyMs,
          detail: `Header mismatch cache-control="${cacheControl}" service-worker-allowed="${swAllowed}"`,
        });
      } else {
        results.push({
          name: 'Service worker endpoint',
          status: 'pass',
          latencyMs: response.latencyMs,
          detail: 'Headers look correct for SW updates',
        });
      }
    }
  }

  {
    const url = `${baseUrl}/offline.html`;
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      results.push({
        name: 'Offline fallback page',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: response.error,
      });
    } else if (!response.response.ok) {
      results.push({
        name: 'Offline fallback page',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: `Unexpected status ${response.response.status}`,
      });
    } else {
      const body = (await readTextSafe(response.response)).toLowerCase();
      if (!body.includes('offline')) {
        results.push({
          name: 'Offline fallback page',
          status: 'warn',
          latencyMs: response.latencyMs,
          detail: 'Page is reachable but content does not contain "offline"',
        });
      } else {
        results.push({
          name: 'Offline fallback page',
          status: 'pass',
          latencyMs: response.latencyMs,
          detail: 'Fallback content detected',
        });
      }
    }
  }

  if (alertSecret) {
    const url = `${baseUrl}/api/internal/pwa/slo-alerts`;
    const response = await fetchWithTimeout(url, timeoutMs, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alertSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      results.push({
        name: 'Internal alert endpoint (authenticated)',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: response.error,
      });
    } else if (response.response.ok) {
      const payload = await readJsonSafe(response.response);
      const status = payload?.result?.status ?? 'unknown';
      const reason = payload?.result?.reason ?? 'n/a';
      results.push({
        name: 'Internal alert endpoint (authenticated)',
        status: 'pass',
        latencyMs: response.latencyMs,
        detail: `HTTP ${response.response.status}, result=${status}, reason=${reason}`,
      });
    } else {
      const payload = await readJsonSafe(response.response);
      const reason = payload?.result?.reason ?? payload?.error ?? `HTTP ${response.response.status}`;
      const failureStatus = requireAlertSuccess ? 'fail' : 'warn';
      results.push({
        name: 'Internal alert endpoint (authenticated)',
        status: failureStatus,
        latencyMs: response.latencyMs,
        detail: `Alert check returned non-OK (${reason})`,
      });
    }

    const statusUrl = `${baseUrl}/api/internal/pwa/rollout-status?windowMinutes=60&dispatchLimit=5`;
    const statusResponse = await fetchWithTimeout(statusUrl, timeoutMs, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${alertSecret}`,
      },
    });

    if (!statusResponse.ok) {
      results.push({
        name: 'Internal rollout status endpoint (authenticated)',
        status: 'fail',
        latencyMs: statusResponse.latencyMs,
        detail: statusResponse.error,
      });
    } else if (!statusResponse.response.ok) {
      const payload = await readJsonSafe(statusResponse.response);
      const reason = payload?.error ?? `HTTP ${statusResponse.response.status}`;
      const failureStatus = requireAlertSuccess ? 'fail' : 'warn';
      results.push({
        name: 'Internal rollout status endpoint (authenticated)',
        status: failureStatus,
        latencyMs: statusResponse.latencyMs,
        detail: `Rollout status returned non-OK (${reason})`,
      });
    } else {
      const payload = await readJsonSafe(statusResponse.response);
      const summaryStatus = payload?.summary?.status ?? 'unknown';
      const source = payload?.source ?? 'unknown';
      const alertCount = Array.isArray(payload?.summary?.alerts) ? payload.summary.alerts.length : 'n/a';
      const rolloutPercent = payload?.config?.rolloutPercent;
      const severityStatus =
        summaryStatus === 'fail'
          ? (requireAlertSuccess ? 'fail' : 'warn')
          : summaryStatus === 'warn'
            ? 'warn'
            : 'pass';

      results.push({
        name: 'Internal rollout status endpoint (authenticated)',
        status: severityStatus,
        latencyMs: statusResponse.latencyMs,
        detail: `summary=${summaryStatus}, source=${source}, alerts=${alertCount}, rolloutPercent=${rolloutPercent}`,
      });
    }
  } else {
    const url = `${baseUrl}/api/internal/pwa/slo-alerts`;
    const response = await fetchWithTimeout(url, timeoutMs, { method: 'GET' });
    if (!response.ok) {
      results.push({
        name: 'Internal alert endpoint (no secret)',
        status: 'fail',
        latencyMs: response.latencyMs,
        detail: response.error,
      });
    } else if (response.response.status === 401 || response.response.status === 503) {
      results.push({
        name: 'Internal alert endpoint (no secret)',
        status: 'pass',
        latencyMs: response.latencyMs,
        detail: `Protected route is reachable (HTTP ${response.response.status})`,
      });
    } else {
      results.push({
        name: 'Internal alert endpoint (no secret)',
        status: 'warn',
        latencyMs: response.latencyMs,
        detail: `Unexpected status ${response.response.status} without secret`,
      });
    }

    const statusUrl = `${baseUrl}/api/internal/pwa/rollout-status`;
    const statusResponse = await fetchWithTimeout(statusUrl, timeoutMs, { method: 'GET' });
    if (!statusResponse.ok) {
      results.push({
        name: 'Internal rollout status endpoint (no secret)',
        status: 'fail',
        latencyMs: statusResponse.latencyMs,
        detail: statusResponse.error,
      });
    } else if (statusResponse.response.status === 401 || statusResponse.response.status === 503) {
      results.push({
        name: 'Internal rollout status endpoint (no secret)',
        status: 'pass',
        latencyMs: statusResponse.latencyMs,
        detail: `Protected route is reachable (HTTP ${statusResponse.response.status})`,
      });
    } else {
      results.push({
        name: 'Internal rollout status endpoint (no secret)',
        status: 'warn',
        latencyMs: statusResponse.latencyMs,
        detail: `Unexpected status ${statusResponse.response.status} without secret`,
      });
    }
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true' || args.h === 'true') {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(
    args['base-url']
      ?? process.env.PWA_BURN_IN_BASE_URL
      ?? process.env.NEXT_PUBLIC_SITE_URL
      ?? 'http://localhost:5000',
  );
  if (!baseUrl) {
    throw new Error('Invalid base URL. Provide --base-url or set PWA_BURN_IN_BASE_URL.');
  }

  const alertSecret = (args['alert-secret'] ?? process.env.PWA_SLO_ALERT_SECRET ?? '').trim();
  const timeoutMs = toInteger(
    args['timeout-ms'] ?? process.env.PWA_BURN_IN_TIMEOUT_MS,
    10_000,
    { min: 1_000, max: 60_000 },
  );
  const requireAlertSuccess = toBoolean(
    args['require-alert-success'] ?? process.env.PWA_BURN_IN_REQUIRE_ALERT_SUCCESS,
    false,
  );

  const results = await runChecks({
    baseUrl,
    alertSecret,
    timeoutMs,
    requireAlertSuccess,
  });
  printResults(baseUrl, timeoutMs, requireAlertSuccess, results);

  const hasFailures = results.some((result) => result.status === 'fail');
  if (hasFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pwa-burn-in-check error: ${message}`);
  process.exit(1);
});
