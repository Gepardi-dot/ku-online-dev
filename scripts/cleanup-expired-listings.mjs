#!/usr/bin/env node

import { algoliasearch } from 'algoliasearch';
import { createClient } from '@supabase/supabase-js';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_INDEX_NAME,
  CLEANUP_BATCH_SIZE,
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
const bucket = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

const batchSize = Number.parseInt(CLEANUP_BATCH_SIZE ?? '200', 10);
const limit = Number.isFinite(batchSize) && batchSize > 0 ? Math.min(batchSize, 1000) : 200;

function collectVariantPaths(path) {
  if (!path || typeof path !== 'string') return [];
  const trimmed = path.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return [];

  const variants = new Set();
  variants.add(trimmed);
  if (trimmed.includes('-full.')) {
    variants.add(trimmed.replace('-full.', '-thumb.'));
    return Array.from(variants);
  }
  if (trimmed.includes('-thumb.')) {
    variants.add(trimmed.replace('-thumb.', '-full.'));
    return Array.from(variants);
  }

  const lastSlash = trimmed.lastIndexOf('/');
  const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const dotIndex = name.lastIndexOf('.');
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
  const thumbExtension = extension === 'avif' ? 'avif' : 'webp';
  const prefix = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : '';
  variants.add(`${prefix}${baseName}-thumb.${thumbExtension}`);
  return Array.from(variants);
}

async function removeStoragePaths(paths) {
  if (!paths.length) return;
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const chunkSize = 200;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      console.warn('Failed to delete storage paths batch', error);
    }
  }
}

async function fetchExpiredBatch(nowIso) {
  const { data, error } = await supabase
    .from('products')
    .select('id, images, expires_at, is_active')
    .lte('expires_at', nowIso)
    .eq('is_active', true)
    .order('expires_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function main() {
  const nowIso = new Date().toISOString();
  let totalExpired = 0;

  while (true) {
    const rows = await fetchExpiredBatch(nowIso);
    if (rows.length === 0) {
      break;
    }

    const ids = rows.map((row) => row.id).filter(Boolean);
    const paths = rows.flatMap((row) =>
      Array.isArray(row.images) ? row.images.flatMap((path) => collectVariantPaths(path)) : [],
    );

    if (ids.length > 0) {
      const { error } = await supabase.from('products').update({ is_active: false }).in('id', ids);
      if (error) {
        console.warn('Failed to mark expired listings inactive', error);
      }

      try {
        await client.deleteObjects({
          indexName,
          objectIDs: ids,
          waitForTasks: false,
        });
      } catch (algoliaError) {
        console.warn('Failed to delete expired listings from Algolia', algoliaError);
      }
    }

    if (paths.length > 0) {
      await removeStoragePaths(paths);
    }

    totalExpired += rows.length;
    console.log(`Processed ${rows.length} expired listings (total ${totalExpired}).`);
  }

  console.log(`Cleanup complete. Total expired listings processed: ${totalExpired}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
