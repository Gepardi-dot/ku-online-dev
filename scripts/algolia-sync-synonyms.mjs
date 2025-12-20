#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
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
    const key = trimmed.toLowerCase();
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

async function main() {
  console.log(`Syncing Algolia synonyms for "${indexName}"...`);

  const categories = await fetchCategories();
  const categorySynonyms = buildCategorySynonyms(categories);
  const customSynonyms = loadCustomSynonyms();
  const synonyms = [...categorySynonyms, ...customSynonyms];

  if (synonyms.length === 0) {
    console.log('No synonyms to sync.');
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

  console.log(`Synonyms synced: ${synonyms.length} sets.`);
  if (customSynonyms.length === 0) {
    console.log('Tip: add brand synonyms in scripts/algolia-synonyms.json if needed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
