#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

export const REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ALGOLIA_APP_ID',
  'ALGOLIA_ADMIN_API_KEY',
  'ALGOLIA_SEARCH_API_KEY',
  'ALGOLIA_INDEX_NAME',
];

const DEFAULT_SITE_URL = 'https://www.kubazar.net';
const DESCRIPTION = 'Temporary production search smoke listing; delete immediately.';
const WAIT_TIMEOUT_MS = 60_000;

export function collectMissingEnv(env = process.env) {
  return REQUIRED_ENV_KEYS.filter((key) => !String(env[key] ?? '').trim());
}

export function buildSmokeTitle(productId) {
  return `KU BAZAR ALGOLIA SMOKE DELETE ${String(productId).slice(0, 8).toUpperCase()}`;
}

export function buildSmokeProductPayload({ productId, title, expiresAt }) {
  return {
    id: productId,
    title,
    description: DESCRIPTION,
    price: 12345,
    currency: 'IQD',
    condition: 'New',
    category_id: null,
    seller_id: null,
    location: 'Duhok',
    images: [],
    is_active: true,
    is_sold: false,
    is_promoted: false,
    views: 0,
    expires_at: expiresAt.toISOString(),
    listing_type: 'sale',
    rental_term: null,
  };
}

export function buildAlgoliaRecord(row) {
  const createdAt = row.created_at ?? new Date().toISOString();
  const updatedAt = row.updated_at ?? createdAt;
  const expiresAt = row.expires_at;

  return {
    objectID: row.id,
    id: row.id,
    title: row.title,
    description: row.description ?? DESCRIPTION,
    title_i18n_en: null,
    title_i18n_ar: null,
    title_i18n_ku: null,
    title_i18n_ku_latn: null,
    description_i18n_en: null,
    description_i18n_ar: null,
    description_i18n_ku: null,
    description_i18n_ku_latn: null,
    price: Number(row.price ?? 0),
    original_price: null,
    currency: row.currency ?? 'IQD',
    condition: row.condition ?? 'New',
    listing_type: row.listing_type ?? 'sale',
    rental_term: row.rental_term ?? null,
    color_token: null,
    category_id: row.category_id ?? null,
    category_name: null,
    category_name_ar: null,
    category_name_ku: null,
    seller_id: row.seller_id ?? null,
    seller_full_name: null,
    seller_name: null,
    seller_email: null,
    seller_avatar: null,
    seller_is_verified: false,
    location: row.location ?? 'Duhok',
    location_normalized: String(row.location ?? 'Duhok').trim().toLowerCase(),
    images: Array.isArray(row.images) ? row.images : [],
    image_thumb_path: null,
    is_active: row.is_active !== false,
    is_sold: row.is_sold === true,
    is_promoted: row.is_promoted === true,
    views: Number(row.views ?? 0),
    created_at: createdAt,
    created_at_ts: Date.parse(createdAt),
    expires_at_ts: Date.parse(expiresAt),
    updated_at: updatedAt,
    search_text: `${row.title} ${row.description ?? DESCRIPTION} ${row.location ?? 'Duhok'}`,
  };
}

function algoliaHeaders(env, apiKey) {
  return {
    'x-algolia-application-id': env.ALGOLIA_APP_ID,
    'x-algolia-api-key': apiKey,
    'content-type': 'application/json',
  };
}

async function algoliaRequest(path, { env, method = 'GET', key = env.ALGOLIA_ADMIN_API_KEY, body } = {}) {
  const response = await fetch(`https://${env.ALGOLIA_APP_ID}.algolia.net${path}`, {
    method,
    headers: algoliaHeaders(env, key),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Algolia ${method} ${path} failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function waitForAlgoliaTask(indexName, taskID, env) {
  if (!taskID) return;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await algoliaRequest(`/1/indexes/${encodeURIComponent(indexName)}/task/${taskID}`, { env });
    if (result.status === 'published') return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Algolia task ${taskID} did not publish within 30s`);
}

async function searchAlgoliaReplica({ env, title, objectID }) {
  const replicaName = `${env.ALGOLIA_INDEX_NAME}_newest`;
  const result = await algoliaRequest(`/1/indexes/${encodeURIComponent(replicaName)}/query`, {
    env,
    method: 'POST',
    key: env.ALGOLIA_SEARCH_API_KEY,
    body: {
      query: title,
      hitsPerPage: 5,
      filters: 'is_active:true AND is_sold:false',
      numericFilters: [`expires_at_ts>=${Date.now()}`],
      attributesToRetrieve: ['objectID', 'id', 'title'],
      attributesToHighlight: [],
    },
  });
  const found = Array.isArray(result.hits) && result.hits.some((hit) => hit.objectID === objectID || hit.id === objectID);
  return { found, nbHits: result.nbHits ?? null };
}

async function waitForDirectAlgoliaHit({ env, title, objectID, expectedPresent }) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await searchAlgoliaReplica({ env, title, objectID });
    if (last.found === expectedPresent) return last;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Direct Algolia expected present=${expectedPresent}, last=${JSON.stringify(last)}`);
}

async function waitForPublicApiHit({ siteUrl, title, objectID }) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const url = `${siteUrl}/api/products/search?search=${encodeURIComponent(title)}&cb=${Date.now()}`;
    const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
    const text = await response.text();

    if (!response.ok) {
      last = { status: response.status, body: text.slice(0, 200) };
    } else {
      const data = JSON.parse(text);
      const found = Array.isArray(data.items) && data.items.some((item) => item.id === objectID || item.title === title);
      last = {
        status: response.status,
        count: data.count ?? null,
        items: Array.isArray(data.items) ? data.items.length : null,
        found,
      };
      if (found) return last;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Public product search did not return smoke listing. Last=${JSON.stringify(last)}`);
}

async function deleteSmokeRow(supabase, productId) {
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw error;

  const { count, error: countError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('id', productId);
  if (countError) throw countError;
  if (count !== 0) throw new Error(`DB cleanup count was ${count}`);
}

export async function runAlgoliaProductionSmoke({ env = process.env, siteUrl = env.ALGOLIA_SMOKE_SITE_URL || DEFAULT_SITE_URL } = {}) {
  const missing = collectMissingEnv(env);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const productId = randomUUID();
  const title = buildSmokeTitle(productId);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let dbInserted = false;
  let algoliaSaved = false;
  let verified = false;
  const cleanupErrors = [];

  try {
    console.log(`smoke.product_id: ${productId}`);
    console.log(`smoke.title: ${title}`);

    const { data: row, error } = await supabase
      .from('products')
      .insert(buildSmokeProductPayload({ productId, title, expiresAt }))
      .select('id,title,description,price,currency,condition,category_id,seller_id,location,images,is_active,is_sold,is_promoted,views,created_at,updated_at,expires_at,listing_type,rental_term')
      .single();

    if (error) throw error;
    if (!row?.id || row.id !== productId) {
      throw new Error(`Unexpected insert result for ${productId}`);
    }
    dbInserted = true;
    console.log('insert.db: pass');

    const saveResult = await algoliaRequest(`/1/indexes/${encodeURIComponent(env.ALGOLIA_INDEX_NAME)}/${encodeURIComponent(productId)}`, {
      env,
      method: 'PUT',
      body: buildAlgoliaRecord(row),
    });
    algoliaSaved = true;
    await waitForAlgoliaTask(env.ALGOLIA_INDEX_NAME, saveResult.taskID, env);
    console.log('index.algolia: pass');

    const directHit = await waitForDirectAlgoliaHit({ env, title, objectID: productId, expectedPresent: true });
    console.log(`direct.algolia.search: pass nbHits=${directHit.nbHits}`);

    const publicHit = await waitForPublicApiHit({ siteUrl: siteUrl.replace(/\/$/, ''), title, objectID: productId });
    console.log(`public.api.search: pass count=${publicHit.count} items=${publicHit.items}`);
    verified = true;
  } finally {
    if (algoliaSaved) {
      try {
        const deleteResult = await algoliaRequest(`/1/indexes/${encodeURIComponent(env.ALGOLIA_INDEX_NAME)}/${encodeURIComponent(productId)}`, {
          env,
          method: 'DELETE',
        });
        await waitForAlgoliaTask(env.ALGOLIA_INDEX_NAME, deleteResult.taskID, env);
        await waitForDirectAlgoliaHit({ env, title, objectID: productId, expectedPresent: false });
        console.log('cleanup.algolia: pass');
      } catch (error) {
        cleanupErrors.push(`Algolia cleanup failed: ${error.message}`);
        console.log('cleanup.algolia: fail');
      }
    } else {
      console.log('cleanup.algolia: skipped_no_saved_object');
    }

    if (dbInserted) {
      try {
        await deleteSmokeRow(supabase, productId);
        console.log('cleanup.db: pass');
      } catch (error) {
        cleanupErrors.push(`DB cleanup failed: ${error.message}`);
        console.log('cleanup.db: fail');
      }
    } else {
      console.log('cleanup.db: skipped_no_insert');
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join('; '));
  }
  if (!verified) {
    throw new Error('Smoke verification failed before completion; cleanup was attempted.');
  }

  console.log('smoke.cleanup: complete');
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runAlgoliaProductionSmoke().catch((error) => {
    console.error('algolia-production-smoke failed:', error.message);
    process.exit(1);
  });
}
