#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { algoliasearch } from 'algoliasearch';
import { createClient } from '@supabase/supabase-js';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_INDEX_NAME,
  ALGOLIA_SYNONYMS_FILE,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY || !ALGOLIA_INDEX_NAME) {
  console.error('Missing Algolia env vars. Set ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, and ALGOLIA_INDEX_NAME.');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
const indexName = ALGOLIA_INDEX_NAME;

const DEFAULT_SYNONYMS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'algolia-synonyms.json',
);

const argv = process.argv.slice(2);
const cli = parseArgs(argv);

const autoConfig = {
  sinceDays: parseNumber(cli.sinceDays ?? process.env.ALGOLIA_AUTO_SYNONYM_SINCE_DAYS, 30),
  maxEvents: parseNumber(cli.maxEvents ?? process.env.ALGOLIA_AUTO_SYNONYM_MAX_EVENTS, 50_000),
  minCount: parseNumber(process.env.ALGOLIA_AUTO_SYNONYM_MIN_COUNT, 3),
  minProducts: parseNumber(process.env.ALGOLIA_AUTO_SYNONYM_MIN_PRODUCTS, 2),
  minConfidence: parseNumber(process.env.ALGOLIA_AUTO_SYNONYM_MIN_CONFIDENCE, 0.2),
  maxExpansions: parseNumber(process.env.ALGOLIA_AUTO_SYNONYM_MAX_EXPANSIONS, 5),
  maxSets: parseNumber(process.env.ALGOLIA_AUTO_SYNONYM_MAX_SETS, 1000),
  maxProductIdSamples: parseNumber(process.env.ALGOLIA_AUTO_SYNONYM_MAX_PRODUCT_SAMPLES, 6),
};

function parseArgs(args) {
  const options = {
    dryRun: false,
    auto: false,
    pruneAuto: false,
    sinceDays: null,
    maxEvents: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (token === '--auto') {
      options.auto = true;
      continue;
    }
    if (token === '--prune-auto') {
      options.pruneAuto = true;
      continue;
    }

    if (token === '--since-days') {
      options.sinceDays = args[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (token === '--max-events') {
      options.maxEvents = args[i + 1] ?? null;
      i += 1;
      continue;
    }
  }

  if (options.pruneAuto) {
    options.auto = true;
  }

  return options;
}

function parseNumber(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSearchText(value) {
  if (!value) {
    return '';
  }

  const stripped = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return stripped
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0643/g, '\u06A9')
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u06CC');
}

function normalizeKey(value) {
  return normalizeSearchText(value).toLowerCase();
}

function normalizeToken(value) {
  if (!value) return '';
  return String(value).trim();
}

function uniqueSynonyms(values) {
  const seen = new Set();
  const list = [];
  for (const value of values) {
    const trimmed = normalizeToken(value);
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(trimmed);
  }
  return list;
}

function buildCategorySynonyms(categories) {
  const synonyms = [];
  for (const category of categories) {
    const tokens = uniqueSynonyms([
      category.name,
      category.name_ar,
      category.name_ku,
    ]);
    if (tokens.length < 2) {
      continue;
    }

    synonyms.push({
      objectID: `category:${category.id}`,
      type: 'synonym',
      synonyms: tokens,
    });
  }
  return synonyms;
}

function normalizeCustomSynonyms(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry, index) => {
      if (Array.isArray(entry)) {
        const synonyms = uniqueSynonyms(entry);
        if (synonyms.length < 2) {
          return null;
        }
        return {
          objectID: `custom:${index + 1}`,
          type: 'synonym',
          synonyms,
        };
      }

      if (entry && typeof entry === 'object' && Array.isArray(entry.synonyms)) {
        const synonyms = uniqueSynonyms(entry.synonyms);
        if (synonyms.length < 2) {
          return null;
        }
        return {
          objectID: entry.objectID || `custom:${index + 1}`,
          type: entry.type || 'synonym',
          synonyms,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function loadCustomSynonyms() {
  const candidate = ALGOLIA_SYNONYMS_FILE || DEFAULT_SYNONYMS_FILE;
  if (!candidate || !fs.existsSync(candidate)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(candidate, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeCustomSynonyms(parsed);
  } catch (error) {
    console.warn('Failed to read custom synonyms file. Skipping.', error);
    return [];
  }
}

async function fetchCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, name_ar, name_ku, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).filter((row) => row.is_active !== false);
}

const WORD_RE = /[\p{L}\p{N}]+/gu;

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'with',
  'from',
  'by',
  'new',
  'used',
  'sale',
  'buy',
  'sell',
  'free',
  'و',
  'او',
  'أو',
  'في',
  'من',
  'على',
  'الى',
  'إلى',
  'مع',
  'لە',
  'بۆ',
  'بە',
  'یان',
  'یا',
  'u',
  'yan',
  'ya',
  'le',
  'li',
  'bo',
  'bi',
  'ji',
]);

function tokenize(value) {
  const normalized = normalizeKey(value);
  const rawTokens = normalized.match(WORD_RE) ?? [];
  const seen = new Set();
  const tokens = [];
  for (const token of rawTokens) {
    if (!token) continue;
    if (token.length < 2 || token.length > 32) continue;
    if (/^\d+$/.test(token)) continue;
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function stableObjectId(prefix, value) {
  const hash = createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
  return `${prefix}:${hash}`;
}

function buildProductText(product) {
  if (!product) return '';
  const category = product.category ?? null;
  return [
    product.title ?? '',
    category?.name ?? '',
    category?.name_ar ?? '',
    category?.name_ku ?? '',
  ]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim();
}

async function fetchSearchClickEvents(sinceIso, maxEvents) {
  const events = [];
  const pageSize = 1000;
  let offset = 0;

  while (events.length < maxEvents) {
    const { data, error } = await supabase
      .from('search_click_events')
      .select(`
        query,
        locale,
        created_at,
        product:products(
          id,
          title,
          category:categories(
            id,
            name,
            name_ar,
            name_ku
          )
        )
      `)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      if (row?.product?.id && typeof row?.query === 'string') {
        events.push(row);
      }
    }

    offset += rows.length;
    if (rows.length < pageSize) {
      break;
    }
  }

  return events.slice(0, maxEvents);
}

function buildAutoSynonymsFromClicks(events, config) {
  const queryTokenEvents = new Map();
  const pairStats = new Map();

  for (const event of events) {
    const queryTokens = tokenize(event.query);
    if (queryTokens.length === 0) continue;

    const productText = buildProductText(event.product);
    const productTokens = tokenize(productText);
    if (productTokens.length === 0) continue;

    const productId = event.product?.id ?? null;
    const productTokenSet = new Set(productTokens);

    for (const queryToken of queryTokens) {
      queryTokenEvents.set(queryToken, (queryTokenEvents.get(queryToken) ?? 0) + 1);

      for (const productToken of productTokenSet) {
        if (productToken === queryToken) continue;
        const key = `${queryToken}\0${productToken}`;
        const current = pairStats.get(key) ?? { count: 0, productIds: new Set() };
        current.count += 1;
        if (productId && current.productIds.size < config.maxProductIdSamples) {
          current.productIds.add(productId);
        }
        pairStats.set(key, current);
      }
    }
  }

  const candidatesByQuery = new Map();
  for (const [key, stats] of pairStats.entries()) {
    const splitIndex = key.indexOf('\0');
    if (splitIndex <= 0) continue;
    const queryToken = key.slice(0, splitIndex);
    const productToken = key.slice(splitIndex + 1);
    const list = candidatesByQuery.get(queryToken) ?? [];
    list.push({
      token: productToken,
      count: stats.count,
      products: stats.productIds.size,
    });
    candidatesByQuery.set(queryToken, list);
  }

  const sortedQueries = Array.from(candidatesByQuery.keys())
    .map((queryToken) => ({ queryToken, events: queryTokenEvents.get(queryToken) ?? 0 }))
    .filter((entry) => entry.events > 0)
    .sort((a, b) => b.events - a.events);

  const synonyms = [];
  for (const entry of sortedQueries) {
    if (synonyms.length >= config.maxSets) break;

    const totalEvents = entry.events;
    const queryToken = entry.queryToken;
    const candidates = candidatesByQuery.get(queryToken) ?? [];

    const expansions = candidates
      .filter((candidate) => {
        if (candidate.count < config.minCount) return false;
        if (candidate.products < config.minProducts) return false;
        return candidate.count / totalEvents >= config.minConfidence;
      })
      .sort((a, b) => b.count - a.count || b.products - a.products)
      .slice(0, config.maxExpansions)
      .map((candidate) => candidate.token);

    if (expansions.length === 0) {
      continue;
    }

    synonyms.push({
      objectID: stableObjectId('auto', queryToken),
      type: 'oneWaySynonym',
      input: queryToken,
      synonyms: expansions,
    });
  }

  return synonyms;
}

async function fetchAllSynonyms() {
  const hits = [];
  const hitsPerPage = 1000;
  let page = 0;

  while (true) {
    const response = await client.searchSynonyms({
      indexName,
      searchSynonymsParams: {
        hitsPerPage,
        page,
      },
    });

    const pageHits = Array.isArray(response?.hits) ? response.hits : [];
    hits.push(...pageHits);
    if (pageHits.length < hitsPerPage) {
      break;
    }

    page += 1;
    if (page > 200) {
      break;
    }
  }

  return hits;
}

async function pruneAutoSynonyms(desiredAutoIds) {
  const existing = await fetchAllSynonyms();
  const stale = existing
    .map((hit) => hit?.objectID)
    .filter((id) => typeof id === 'string' && id.startsWith('auto:') && !desiredAutoIds.has(id));

  if (stale.length === 0) {
    return 0;
  }

  let removed = 0;
  for (const objectID of stale) {
    try {
      const task = await client.deleteSynonym({ indexName, objectID });
      if (task?.taskID) {
        await client.waitForTask({ indexName, taskID: task.taskID });
      }
      removed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to delete stale synonym ${objectID}: ${message}`);
    }
  }

  return removed;
}

async function main() {
  console.log(`Syncing Algolia synonyms for "${indexName}"...`);

  const categories = await fetchCategories();
  const categorySynonyms = buildCategorySynonyms(categories);
  const customSynonyms = loadCustomSynonyms();

  let autoSynonyms = [];
  if (cli.auto) {
    const sinceMs = autoConfig.sinceDays * 86_400_000;
    const sinceIso = new Date(Date.now() - sinceMs).toISOString();

    try {
      const events = await fetchSearchClickEvents(sinceIso, autoConfig.maxEvents);
      autoSynonyms = buildAutoSynonymsFromClicks(events, autoConfig);
      console.log(`Auto synonyms generated: ${autoSynonyms.length} sets from ${events.length} clicks.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Unable to build auto synonyms: ${message}`);
    }
  }

  const synonyms = [...categorySynonyms, ...customSynonyms, ...autoSynonyms];

  if (synonyms.length === 0) {
    console.log('No synonyms to sync.');
    return;
  }

  if (cli.dryRun) {
    console.log(`Category synonym sets: ${categorySynonyms.length}`);
    console.log(`Custom synonym sets: ${customSynonyms.length}`);
    console.log(`Auto synonym sets: ${autoSynonyms.length}`);

    for (const sample of autoSynonyms.slice(0, 10)) {
      console.log(`auto: ${sample.input} -> ${sample.synonyms.join(', ')}`);
    }
    return;
  }

  const task = await client.saveSynonyms({
    indexName,
    synonymHit: synonyms,
    replaceExistingSynonyms: false,
  });

  if (task?.taskID) {
    await client.waitForTask({ indexName, taskID: task.taskID });
  }

  let removed = 0;
  if (cli.pruneAuto && autoSynonyms.length > 0) {
    const desiredIds = new Set(autoSynonyms.map((synonym) => synonym.objectID));
    removed = await pruneAutoSynonyms(desiredIds);
  }

  console.log(`Synonyms synced: ${synonyms.length} sets.`);
  if (removed > 0) {
    console.log(`Pruned auto synonyms: ${removed} sets.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
