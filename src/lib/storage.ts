import { createClient } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
} = getEnv();

const supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

export async function createSignedUrl(path: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error('Failed to sign storage path', path, error);
    return null;
  }

  return data?.signedUrl ?? null;
}

export async function createSignedUrls(paths: string[], expiresInSeconds = 60 * 60): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) {
    return {};
  }

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(unique, expiresInSeconds);

  if (error) {
    console.error('Failed to sign storage paths', error);
    return {};
  }

  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry?.path && entry?.signedUrl) {
      map[entry.path] = entry.signedUrl;
    }
  }
  return map;
}

// Transform a Supabase signed object URL into a transformed image URL.
// Converts: /storage/v1/object/sign/<bucket>/<path>?token=...
// To:       /storage/v1/render/image/sign/<bucket>/<path>?token=...&width=...&height=...&resize=contain|cover&quality=...
export function transformSignedImageUrl(
  signedUrl: string | null | undefined,
  options: { width?: number; height?: number; resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'; quality?: number; format?: 'webp' | 'png' | 'jpeg' } = {},
): string | null {
  if (!signedUrl || typeof signedUrl !== 'string') return null;
  if (!signedUrl.includes('/storage/v1/object/sign/')) {
    // Non-Supabase or public URL; return as-is
    return signedUrl;
  }

  try {
    const url = new URL(signedUrl);
    url.pathname = url.pathname.replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/');

    if (options.width && Number.isFinite(options.width)) {
      url.searchParams.set('width', String(options.width));
    }
    if (options.height && Number.isFinite(options.height)) {
      url.searchParams.set('height', String(options.height));
    }
    if (options.resize) {
      url.searchParams.set('resize', options.resize);
    } else {
      url.searchParams.set('resize', 'contain');
    }
    if (options.quality && Number.isFinite(options.quality)) {
      url.searchParams.set('quality', String(options.quality));
    }
    if (options.format) {
      url.searchParams.set('format', options.format);
    }

    return url.toString();
  } catch (error) {
    console.warn('Failed to transform signed image URL', error);
    return signedUrl;
  }
}

export async function createTransformedSignedUrls(
  paths: string[],
  options: { width?: number; height?: number; resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'; quality?: number; format?: 'webp' | 'png' | 'jpeg' } = {},
  expiresInSeconds = 60 * 60,
): Promise<Record<string, string>> {
  const base = await createSignedUrls(paths, expiresInSeconds);
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(base)) {
    const t = transformSignedImageUrl(url, options);
    if (t) out[path] = t;
  }
  return out;
}
