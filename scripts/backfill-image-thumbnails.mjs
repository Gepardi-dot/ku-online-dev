#!/usr/bin/env node

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  UPLOAD_THUMB_MAX_EDGE,
  UPLOAD_THUMB_QUALITY,
  BACKFILL_BATCH_SIZE,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const bucket = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const batchSize = Number.parseInt(BACKFILL_BATCH_SIZE ?? '200', 10);
const limit = Number.isFinite(batchSize) && batchSize > 0 ? Math.min(batchSize, 1000) : 200;
const thumbMaxEdge = Number.parseInt(UPLOAD_THUMB_MAX_EDGE ?? '640', 10);
const thumbQuality = Number.parseInt(UPLOAD_THUMB_QUALITY ?? '72', 10);

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cli = parseArgs(process.argv.slice(2));

function parseArgs(args) {
  const options = {
    dryRun: false,
    maxProducts: null,
    maxImages: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (token === '--max-products') {
      options.maxProducts = parseNumber(args[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--max-images') {
      options.maxImages = parseNumber(args[i + 1]);
      i += 1;
      continue;
    }
  }

  return options;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function deriveThumbPath(path) {
  if (!path || typeof path !== 'string') return null;
  const normalized = path.trim();
  if (!normalized || isAbsoluteUrl(normalized)) return null;

  const lastSlash = normalized.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  if (fileName.includes('-thumb.')) {
    return null;
  }
  if (fileName.includes('-full.')) {
    return normalized.replace('-full.', '-thumb.');
  }
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
  const thumbExtension = extension === 'avif' ? 'avif' : 'webp';
  const prefix = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '';
  return `${prefix}${baseName}-thumb.${thumbExtension}`;
}

async function downloadImage(path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw error ?? new Error('download failed');
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function createThumb(buffer) {
  return sharp(buffer, { limitInputPixels: 10000 * 10000 })
    .rotate()
    .resize({
      width: thumbMaxEdge,
      height: thumbMaxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: Math.max(60, Math.min(95, thumbQuality)), effort: 5 })
    .toBuffer();
}

async function uploadThumb(path, buffer, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });

  if (!error) {
    return { status: 'created' };
  }

  if (error?.status === 409 || error?.statusCode === '409') {
    return { status: 'exists' };
  }

  return { status: 'error', error };
}

async function main() {
  let offset = 0;
  let processedProducts = 0;
  let processedImages = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, images')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      processedProducts += 1;
      if (cli.maxProducts && processedProducts > cli.maxProducts) {
        break;
      }

      const images = Array.isArray(row.images) ? row.images : [];
      for (const path of images) {
        if (cli.maxImages && processedImages >= cli.maxImages) {
          break;
        }
        processedImages += 1;

        const thumbPath = deriveThumbPath(path);
        if (!thumbPath) {
          skipped += 1;
          continue;
        }

        if (cli.dryRun) {
          console.log(`[dry-run] would create ${thumbPath}`);
          skipped += 1;
          continue;
        }

        try {
          const original = await downloadImage(path);
          const isAvif = typeof path === 'string' && path.toLowerCase().endsWith('.avif');
          const thumbBuffer = isAvif ? original : await createThumb(original);
          const contentType = isAvif ? 'image/avif' : 'image/webp';
          const result = await uploadThumb(thumbPath, thumbBuffer, contentType);
          if (result.status === 'created') {
            created += 1;
          } else if (result.status === 'exists') {
            skipped += 1;
          } else {
            failed += 1;
            console.warn('Failed to upload thumbnail', { path, thumbPath, error: result.error });
          }
        } catch (err) {
          failed += 1;
          console.warn('Failed to process image', { path, error: err });
        }
      }

      if (cli.maxImages && processedImages >= cli.maxImages) {
        break;
      }
    }

    if ((cli.maxProducts && processedProducts >= cli.maxProducts) || (cli.maxImages && processedImages >= cli.maxImages)) {
      break;
    }

    offset += rows.length;
    if (rows.length < limit) {
      break;
    }
  }

  console.log('Thumbnail backfill complete.');
  console.log(`Products scanned: ${processedProducts}`);
  console.log(`Images scanned: ${processedImages}`);
  console.log(`Thumbnails created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
