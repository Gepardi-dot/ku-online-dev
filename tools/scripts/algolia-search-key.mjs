#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_DESCRIPTION = 'KU BAZAR production server search key';

function normalizeRequiredString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing ${name}.`);
  }
  return value.trim();
}

function validateAppId(appId) {
  const normalized = normalizeRequiredString(appId, 'ALGOLIA_APP_ID');
  if (!/^[A-Za-z0-9-]+$/.test(normalized)) {
    throw new Error('ALGOLIA_APP_ID contains unsupported characters.');
  }
  return normalized;
}

export function buildIndexScope(indexName) {
  const base = normalizeRequiredString(indexName, 'ALGOLIA_INDEX_NAME');
  return [
    base,
    `${base}_newest`,
    `${base}_price_asc`,
    `${base}_price_desc`,
    `${base}_views_desc`,
  ];
}

function sortedUnique(values) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).sort();
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function isReusableSearchKey(key, { description, indexes }) {
  if (!key || typeof key !== 'object') return false;
  if (typeof key.value !== 'string' || key.value.trim().length === 0) return false;
  if (key.description !== description) return false;

  const acl = sortedUnique(Array.isArray(key.acl) ? key.acl : []);
  if (!arraysEqual(acl, ['search'])) return false;

  const actualIndexes = sortedUnique(Array.isArray(key.indexes) ? key.indexes : []);
  const expectedIndexes = sortedUnique(indexes);
  return arraysEqual(actualIndexes, expectedIndexes);
}

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text ? ` Body: ${text.slice(0, 500)}` : '';
  } catch {
    return '';
  }
}

export async function requestAlgoliaJson({ appId, adminApiKey, path, method = 'GET', body, fetchImpl = fetch }) {
  const normalizedAppId = validateAppId(appId);
  const normalizedAdminKey = normalizeRequiredString(adminApiKey, 'ALGOLIA_ADMIN_API_KEY');
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is unavailable.');
  }

  const response = await fetchImpl(`https://${normalizedAppId}.algolia.net${path}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-algolia-api-key': normalizedAdminKey,
      'x-algolia-application-id': normalizedAppId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const bodyText = await readErrorBody(response);
    throw new Error(`Algolia ${method} ${path} failed with ${response.status}.${bodyText}`);
  }

  return response.json();
}

export async function getOrCreateSearchApiKey({
  appId,
  adminApiKey,
  indexName,
  description = DEFAULT_DESCRIPTION,
  fetchImpl = fetch,
}) {
  const normalizedDescription = normalizeRequiredString(description, 'description');
  const indexes = buildIndexScope(indexName);
  const listResponse = await requestAlgoliaJson({
    appId,
    adminApiKey,
    path: '/1/keys',
    fetchImpl,
  });

  const existing = (Array.isArray(listResponse.keys) ? listResponse.keys : []).find((key) =>
    isReusableSearchKey(key, { description: normalizedDescription, indexes }),
  );

  if (existing) {
    return {
      key: existing.value,
      status: 'reused',
      description: normalizedDescription,
      indexes,
    };
  }

  const createResponse = await requestAlgoliaJson({
    appId,
    adminApiKey,
    path: '/1/keys',
    method: 'POST',
    body: {
      acl: ['search'],
      description: normalizedDescription,
      indexes,
    },
    fetchImpl,
  });

  const createdKey = normalizeRequiredString(createResponse.key, 'created Algolia search key');
  return {
    key: createdKey,
    status: 'created',
    description: normalizedDescription,
    indexes,
  };
}

export async function resolveSearchApiKey({
  existingSearchApiKey,
  appId,
  adminApiKey,
  indexName,
  description = DEFAULT_DESCRIPTION,
  fetchImpl = fetch,
}) {
  const indexes = buildIndexScope(indexName);
  const normalizedExisting = typeof existingSearchApiKey === 'string' ? existingSearchApiKey.trim() : '';
  if (normalizedExisting) {
    return {
      key: normalizedExisting,
      status: 'provided',
      description: normalizeRequiredString(description, 'description'),
      indexes,
    };
  }

  return getOrCreateSearchApiKey({
    appId,
    adminApiKey,
    indexName,
    description,
    fetchImpl,
  });
}

export function writeGitHubEnv(name, value, envPath = process.env.GITHUB_ENV) {
  const envName = normalizeRequiredString(name, 'GitHub env name');
  const envValue = normalizeRequiredString(value, envName);
  if (/[\r\n]/.test(envValue)) {
    throw new Error(`${envName} must be a single-line value.`);
  }
  if (!envPath) {
    return false;
  }
  fs.appendFileSync(envPath, `${envName}=${envValue}\n`, 'utf8');
  return true;
}

function maskForGitHubActions(value) {
  if (process.env.GITHUB_ACTIONS === 'true' && value) {
    console.log(`::add-mask::${value}`);
  }
}

function parseArgs(argv) {
  const args = {
    description: DEFAULT_DESCRIPTION,
    githubEnvName: 'ALGOLIA_SEARCH_API_KEY',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--description') {
      args.description = argv[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--description=')) {
      args.description = arg.slice('--description='.length);
    } else if (arg === '--github-env-name') {
      args.githubEnvName = argv[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--github-env-name=')) {
      args.githubEnvName = arg.slice('--github-env-name='.length);
    } else if (arg === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node tools/scripts/algolia-search-key.mjs [options]

Creates or reuses a restricted Algolia search-only key for the configured product index.
If ALGOLIA_SEARCH_API_KEY is already present, that value is used and no key-management API call is made.

Options:
  --description <text>       API key description used for idempotent reuse.
  --github-env-name <name>   GITHUB_ENV variable name to write. Defaults to ALGOLIA_SEARCH_API_KEY.
  --json                     Print a machine-readable status without the secret key.
  -h, --help                 Show this help.

Required env:
  ALGOLIA_SEARCH_API_KEY (optional; preferred when the admin key cannot manage keys)
  ALGOLIA_APP_ID
  ALGOLIA_ADMIN_API_KEY
  ALGOLIA_INDEX_NAME
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = await resolveSearchApiKey({
    existingSearchApiKey: process.env[args.githubEnvName],
    appId: process.env.ALGOLIA_APP_ID,
    adminApiKey: process.env.ALGOLIA_ADMIN_API_KEY,
    indexName: process.env.ALGOLIA_INDEX_NAME,
    description: args.description,
  });

  maskForGitHubActions(result.key);
  const githubEnvWritten = writeGitHubEnv(args.githubEnvName, result.key);

  const safePayload = {
    status: result.status,
    description: result.description,
    indexes: result.indexes,
    githubEnvWritten,
  };

  if (args.json) {
    console.log(JSON.stringify(safePayload, null, 2));
  } else {
    console.log(
      `Algolia search key ${result.status}; scoped to ${result.indexes.length} index names; ` +
        `GITHUB_ENV ${githubEnvWritten ? 'updated' : 'not available'}.`,
    );
  }
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(`algolia-search-key failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
