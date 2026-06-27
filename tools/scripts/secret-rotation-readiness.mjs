#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const loadedFromFiles = new Set();
const loadedEnvFileNames = new Set();

const envVars = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    kind: 'public',
    tier: 'required',
    owner: 'Supabase',
    verify: 'npm run check:env; protected internal health database/storage checks.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    kind: 'public',
    tier: 'required',
    owner: 'Supabase',
    verify: 'npm run check:env; signed-out browse and signed-in auth smoke.',
  },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    kind: 'public',
    tier: 'recommended',
    owner: 'Application',
    verify: 'canonical production smoke uses https://www.kubazar.net and auth callback URLs match providers.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET',
    kind: 'public',
    tier: 'recommended',
    owner: 'Supabase',
    verify: 'image upload/delete smoke uses the intended product image bucket.',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    kind: 'secret',
    tier: 'required',
    owner: 'Supabase',
    verify: 'protected internal health; admin/service-role route smoke where safe.',
  },
  {
    name: 'ADMIN_REVALIDATE_TOKEN',
    kind: 'secret',
    tier: 'required',
    owner: 'Application',
    verify: 'GET /api/internal/health with Authorization: Bearer returns 200; missing token returns 401.',
  },
  {
    name: 'SENTRY_DSN',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Sentry',
    verify: 'Sentry route wrapper receives server events.',
  },
  {
    name: 'SENTRY_ENVIRONMENT',
    kind: 'secret',
    tier: 'optional',
    owner: 'Sentry',
    verify: 'Sentry events are tagged with the intended environment.',
  },
  {
    name: 'NEXT_PUBLIC_SENTRY_DSN',
    kind: 'public',
    tier: 'recommended',
    owner: 'Sentry',
    verify: 'Client-side Sentry event capture smoke.',
  },
  {
    name: 'ALGOLIA_APP_ID',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Algolia',
    verify: 'product search and scheduled Algolia workflows.',
  },
  {
    name: 'ALGOLIA_ADMIN_API_KEY',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Algolia',
    verify: 'index/synonym maintenance workflows.',
  },
  {
    name: 'ALGOLIA_SEARCH_API_KEY',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Algolia',
    verify: 'product search query smoke.',
  },
  {
    name: 'ALGOLIA_INDEX_NAME',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Algolia',
    verify: 'product search and indexing workflow smoke.',
  },
  {
    name: 'VONAGE_API_KEY',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Vonage',
    verify: 'npm run vonage:status; SMS auth smoke in staging first.',
  },
  {
    name: 'VONAGE_API_SECRET',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Vonage',
    verify: 'npm run vonage:status; SMS auth smoke in staging first.',
  },
  {
    name: 'VONAGE_APPLICATION_ID',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Vonage',
    verify: 'npm run vonage:status.',
  },
  {
    name: 'VONAGE_PRIVATE_KEY64',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Vonage',
    verify: 'npm run vonage:status.',
  },
  {
    name: 'VONAGE_VIRTUAL_NUMBER',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Vonage',
    verify: 'npm run vonage:status.',
  },
  {
    name: 'SUPABASE_SMS_HOOK_SECRET',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Supabase Auth',
    verify: 'SMS auth hook rejects unsigned production requests and accepts a controlled signed staging request.',
  },
  {
    name: 'RESEND_API_KEY',
    kind: 'secret',
    tier: 'optional',
    owner: 'Resend',
    verify: 'partnership email notification smoke if enabled.',
  },
  {
    name: 'OPENAI_API_KEY',
    kind: 'secret',
    tier: 'recommended',
    owner: 'OpenAI',
    verify: 'scheduled product translation/embedding workflow completes without provider auth errors.',
  },
  {
    name: 'PWA_VAPID_PRIVATE_KEY',
    kind: 'secret',
    tier: 'optional',
    owner: 'Application',
    verify: 'push subscription/send smoke if PWA push is enabled.',
  },
  {
    name: 'PWA_SLO_ALERT_WEBHOOK_URL',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Application',
    verify: 'scheduled PWA SLO alerts can deliver active-alert payloads instead of failing skipped_config.',
  },
  {
    name: 'PWA_SLO_ALERT_SECRET',
    kind: 'secret',
    tier: 'recommended',
    owner: 'Application',
    verify: 'scheduled PWA SLO alert workflow and internal alert endpoint authenticate successfully.',
  },
  {
    name: 'UPSTASH_REDIS_REST_URL',
    kind: 'secret',
    tier: 'conditional',
    owner: 'Upstash',
    verify: 'protected internal health rateLimit.source=upstash.',
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    kind: 'secret',
    tier: 'conditional',
    owner: 'Upstash',
    verify: 'protected internal health rateLimit.backend=upstash.',
  },
  {
    name: 'KV_REST_API_URL',
    kind: 'secret',
    tier: 'conditional',
    owner: 'Vercel KV / Upstash',
    verify: 'protected internal health rateLimit.source=vercel-kv.',
  },
  {
    name: 'KV_REST_API_TOKEN',
    kind: 'secret',
    tier: 'conditional',
    owner: 'Vercel KV / Upstash',
    verify: 'protected internal health rateLimit.backend=upstash.',
  },
];

const groups = [
  {
    name: 'durable-rate-limit',
    tier: 'required',
    description: 'Production rate limits must use a durable backend.',
    alternatives: [
      ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
      ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ],
    verify: 'GET /api/internal/health shows rateLimit.configured=true and rateLimit.backend=upstash.',
  },
  {
    name: 'algolia-search',
    tier: 'recommended',
    description: 'Search and indexing are fully configured.',
    allOf: ['ALGOLIA_APP_ID', 'ALGOLIA_ADMIN_API_KEY', 'ALGOLIA_SEARCH_API_KEY', 'ALGOLIA_INDEX_NAME'],
    verify: 'Search smoke and scheduled Algolia workflow logs.',
  },
  {
    name: 'vonage-sms',
    tier: 'recommended',
    description: 'SMS auth/provider checks are fully configured.',
    allOf: [
      'VONAGE_API_KEY',
      'VONAGE_API_SECRET',
      'VONAGE_APPLICATION_ID',
      'VONAGE_PRIVATE_KEY64',
      'VONAGE_VIRTUAL_NUMBER',
    ],
    verify: 'npm run vonage:status; controlled staging SMS smoke.',
  },
];

function parseArgs(argv) {
  const options = {
    json: false,
    mode: 'production',
    noEnvFiles: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-env-files') {
      options.noEnvFiles = true;
    } else if (arg === '--mode') {
      options.mode = argv[index + 1] ?? options.mode;
      index += 1;
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['local', 'production'].includes(options.mode)) {
    throw new Error('--mode must be "local" or "production"');
  }

  return options;
}

function printHelp() {
  console.log(`Secret rotation readiness checker

Usage:
  npm run security:secrets:readiness -- [--mode production|local] [--json] [--no-env-files]

Examples:
  npm run security:secrets:readiness
  npm run security:secrets:readiness -- --json
  vercel env pull .env.local --yes --environment=production
  npm run security:secrets:readiness -- --mode production

The script reports presence only. It never prints secret values.`);
}

function loadEnvFile(relativePath) {
  const absPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absPath)) return;

  const raw = fs.readFileSync(absPath, 'utf8');
  let loadedAnyValue = false;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const [, key, rest] = match;
    let value = rest.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined || loadedFromFiles.has(key)) {
      process.env[key] = value;
      loadedFromFiles.add(key);
      loadedAnyValue = true;
    }
  }

  if (loadedAnyValue) {
    loadedEnvFileNames.add(relativePath);
  }
}

function hasEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function evaluateVar(entry) {
  return {
    ...entry,
    present: hasEnv(entry.name),
  };
}

function evaluateGroup(group) {
  if (group.alternatives) {
    const alternatives = group.alternatives.map((names) => ({
      names,
      complete: names.every(hasEnv),
      missing: names.filter((name) => !hasEnv(name)),
    }));

    return {
      ...group,
      complete: alternatives.some((alternative) => alternative.complete),
      alternatives,
    };
  }

  const missing = group.allOf.filter((name) => !hasEnv(name));
  return {
    ...group,
    complete: missing.length === 0,
    missing,
  };
}

function buildReport(options) {
  const variables = envVars.map(evaluateVar);
  const evaluatedGroups = groups.map(evaluateGroup);
  const missingRequired = variables.filter((entry) => entry.tier === 'required' && !entry.present);
  const missingRequiredGroups =
    options.mode === 'production'
      ? evaluatedGroups.filter((group) => group.tier === 'required' && !group.complete)
      : [];
  const incompleteRecommendedGroups = evaluatedGroups.filter(
    (group) => group.tier === 'recommended' && !group.complete,
  );

  const ok = missingRequired.length === 0 && missingRequiredGroups.length === 0;
  return {
    ok,
    mode: options.mode,
    loadedEnvFiles: Array.from(loadedEnvFileNames),
    variables,
    groups: evaluatedGroups,
    summary: {
      missingRequired: missingRequired.map((entry) => entry.name),
      missingRequiredGroups: missingRequiredGroups.map((group) => group.name),
      incompleteRecommendedGroups: incompleteRecommendedGroups.map((group) => group.name),
    },
  };
}

function printText(report) {
  console.log(`Secret rotation readiness: ${report.ok ? 'PASS' : 'FAIL'} (${report.mode})`);
  console.log(
    `Env files loaded: ${report.loadedEnvFiles.length > 0 ? report.loadedEnvFiles.join(', ') : 'none'}`,
  );
  console.log('');

  console.log('Required variables');
  for (const entry of report.variables.filter((item) => item.tier === 'required')) {
    console.log(`  ${entry.present ? 'PASS' : 'FAIL'} ${entry.name} (${entry.kind}, ${entry.owner})`);
  }

  console.log('');
  console.log('Required groups');
  for (const group of report.groups.filter((item) => item.tier === 'required')) {
    console.log(`  ${group.complete ? 'PASS' : 'FAIL'} ${group.name} - ${group.description}`);
    console.log(`    verify: ${group.verify}`);
  }

  const recommendedVariables = report.variables.filter((item) => item.tier === 'recommended');
  if (recommendedVariables.length > 0) {
    console.log('');
    console.log('Recommended variables');
    for (const entry of recommendedVariables) {
      console.log(
        `  ${entry.present ? 'PASS' : 'WARN'} ${entry.name} (${entry.kind}, ${entry.owner})`,
      );
      console.log(`    verify: ${entry.verify}`);
    }
  }

  const recommended = report.groups.filter((item) => item.tier === 'recommended');
  if (recommended.length > 0) {
    console.log('');
    console.log('Recommended groups');
    for (const group of recommended) {
      console.log(`  ${group.complete ? 'PASS' : 'WARN'} ${group.name} - ${group.description}`);
      console.log(`    verify: ${group.verify}`);
    }
  }

  if (!report.ok) {
    console.log('');
    console.log('Missing required items');
    for (const name of report.summary.missingRequired) {
      console.log(`  - ${name}`);
    }
    for (const name of report.summary.missingRequiredGroups) {
      console.log(`  - group:${name}`);
    }
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.noEnvFiles && process.env.NODE_ENV !== 'production') {
    loadEnvFile('.env');
    loadEnvFile('.env.local');
  }

  const report = buildReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }

  process.exit(report.ok ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
