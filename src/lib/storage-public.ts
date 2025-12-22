const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

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
