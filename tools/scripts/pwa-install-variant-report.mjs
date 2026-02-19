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
    '  node tools/scripts/pwa-install-variant-report.mjs --base-url <url> --alert-secret <secret> [options]',
    '',
    'Options:',
    '  --window-minutes <5-1440>      default 1440',
    '  --timeout-ms <1000-60000>      default 12000',
    '  --output-json',
    '  --help',
    '',
    'Env fallbacks:',
    '  PWA_GOVERNANCE_BASE_URL',
    '  PWA_SLO_ALERT_SECRET',
  ].join('\n');
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

function toInteger(value, fallback, { min, max } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (typeof min === 'number' && floored < min) return fallback;
  if (typeof max === 'number' && floored > max) return fallback;
  return floored;
}

function safeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function safeRate(numerator, denominator) {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function formatRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(2)}%`;
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    return { ok: true, response };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function buildVariantSummary(lifecycle, variant) {
  const shown = safeCount(lifecycle[`install_variant_${variant}_shown`]);
  const cta = safeCount(lifecycle[`install_variant_${variant}_cta_clicked`]);
  const accepted = safeCount(lifecycle[`install_variant_${variant}_accepted`]);
  return {
    variant,
    shown,
    cta,
    accepted,
    ctaRate: safeRate(cta, shown),
    installRate: safeRate(accepted, shown),
    acceptFromCtaRate: safeRate(accepted, cta),
  };
}

function printReport(report) {
  console.log('PWA install variant report');
  console.log(`- Observed at: ${report.observedAt}`);
  console.log(`- Base URL: ${report.baseUrl}`);
  console.log(`- Endpoint: ${report.endpoint}`);
  console.log(`- Window minutes: ${report.windowMinutes}`);
  console.log(`- Source: ${report.source}`);
  console.log(`- Summary status: ${report.summaryStatus}`);
  console.log(`- Total lifecycle events: ${report.lifecycleTotal}`);

  for (const row of report.variants) {
    console.log(`- Variant ${row.variant}: shown=${row.shown}, cta=${row.cta}, accepted=${row.accepted}`);
    console.log(
      `  rates: cta/shown=${formatRate(row.ctaRate)}, accepted/shown=${formatRate(row.installRate)}, accepted/cta=${formatRate(row.acceptFromCtaRate)}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true') {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(args['base-url'] ?? process.env.PWA_GOVERNANCE_BASE_URL);
  const alertSecret = (args['alert-secret'] ?? process.env.PWA_SLO_ALERT_SECRET ?? '').trim();
  const windowMinutes = toInteger(args['window-minutes'], 1440, { min: 5, max: 1440 });
  const timeoutMs = toInteger(args['timeout-ms'], 12000, { min: 1000, max: 60000 });
  const outputJson = args['output-json'] === 'true';

  if (!baseUrl) {
    throw new Error('Missing/invalid base URL. Provide --base-url or PWA_GOVERNANCE_BASE_URL.');
  }
  if (!alertSecret) {
    throw new Error('Missing alert secret. Provide --alert-secret or PWA_SLO_ALERT_SECRET.');
  }

  const params = new URLSearchParams({
    windowMinutes: String(windowMinutes),
    displayMode: 'all',
    dispatchLimit: '10',
  });
  const endpoint = `${baseUrl}/api/internal/pwa/rollout-status?${params.toString()}`;
  const request = await fetchWithTimeout(endpoint, timeoutMs, {
    headers: {
      authorization: `Bearer ${alertSecret}`,
    },
  });

  if (!request.ok) {
    throw new Error(`Failed to fetch rollout status: ${request.error}`);
  }

  if (!request.response.ok) {
    throw new Error(`Rollout status endpoint returned non-OK: HTTP ${request.response.status}`);
  }

  const payload = await request.response.json();
  const lifecycle = payload?.summary?.lifecycle ?? {};
  const variants = [
    buildVariantSummary(lifecycle, 'control'),
    buildVariantSummary(lifecycle, 'spotlight'),
  ];
  const lifecycleTotal = variants.reduce((sum, row) => sum + row.shown + row.cta + row.accepted, 0);

  const report = {
    observedAt: new Date().toISOString(),
    baseUrl,
    endpoint,
    windowMinutes,
    source: payload?.source ?? 'unknown',
    summaryStatus: payload?.summary?.status ?? 'unknown',
    lifecycleTotal,
    variants,
  };

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pwa-install-variant-report error: ${message}`);
  process.exit(1);
});
