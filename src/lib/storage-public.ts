const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;
const PUBLIC_STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
let supabaseHostname: string | null = null;

if (PUBLIC_SUPABASE_URL) {
  try {
    supabaseHostname = new URL(PUBLIC_SUPABASE_URL).hostname;
  } catch {
    supabaseHostname = null;
  }
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizePath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSupabaseStorageUrl(value: string): boolean {
  if (!supabaseHostname) {
    return false;
  }

  try {
    const url = new URL(value);
    if (url.hostname !== supabaseHostname) {
      return false;
    }
    return url.pathname.startsWith('/storage/v1/object/') || url.pathname.startsWith('/storage/v1/render/');
  } catch {
    return false;
  }
}

function isStoragePath(value: string): boolean {
  const normalized = normalizePath(value);
  if (!normalized) {
    return false;
  }
  if (isAbsoluteUrl(normalized)) {
    return false;
  }
  if (normalized.startsWith('/')) {
    return false;
  }
  if (normalized.includes('..') || normalized.includes('\\')) {
    return false;
  }
  return true;
}

export function isAllowedProductImageInput(value: string | null | undefined): boolean {
  const normalized = normalizePath(value);
  if (!normalized) {
    return false;
  }
  if (isStoragePath(normalized)) {
    return true;
  }
  return isSupabaseStorageUrl(normalized);
}

export function assertAllowedProductImagePaths(paths: string[] | null | undefined): string[] {
  const normalized = Array.isArray(paths)
    ? paths
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : [];
  const invalid = normalized.filter((item) => !isAllowedProductImageInput(item));
  if (invalid.length > 0) {
    throw new Error('Images must be stored in Supabase Storage.');
  }
  return normalized;
}

export function deriveThumbPath(path: string | null | undefined): string | null {
  const normalized = normalizePath(path);
  if (!normalized) {
    return null;
  }
  if (isAbsoluteUrl(normalized)) {
    return normalized;
  }

  const lastSlash = normalized.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  if (fileName.includes('-thumb.')) {
    return normalized;
  }
  if (fileName.includes('-full.')) {
    return normalized.replace('-full.', '-thumb.');
  }
  const name = fileName;
  const dotIndex = name.lastIndexOf('.');
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
  const thumbExtension = extension === 'avif' ? 'avif' : 'webp';
  const prefix = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '';
  return `${prefix}${baseName}-thumb.${thumbExtension}`;
}

export function collectImageVariantPaths(path: string | null | undefined): string[] {
  const normalized = normalizePath(path);
  if (!normalized || isAbsoluteUrl(normalized)) {
    return [];
  }

  const variants = new Set<string>();
  variants.add(normalized);
  if (normalized.includes('-full.')) {
    variants.add(normalized.replace('-full.', '-thumb.'));
    return Array.from(variants);
  }
  if (normalized.includes('-thumb.')) {
    variants.add(normalized.replace('-thumb.', '-full.'));
    return Array.from(variants);
  }

  const lastSlash = normalized.lastIndexOf('/');
  const name = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = name.lastIndexOf('.');
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
  const thumbExtension = extension === 'avif' ? 'avif' : 'webp';
  const prefix = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '';
  variants.add(`${prefix}${baseName}-thumb.${thumbExtension}`);
  return Array.from(variants);
}

export function buildPublicStorageUrl(path: string | null | undefined): string | null {
  const normalized = normalizePath(path);
  if (!normalized) {
    return null;
  }
  if (isAbsoluteUrl(normalized)) {
    return normalized;
  }
  if (!PUBLIC_SUPABASE_URL) {
    return null;
  }

  const base = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
  const encodedPath = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/storage/v1/object/public/${PUBLIC_STORAGE_BUCKET}/${encodedPath}`;
}
