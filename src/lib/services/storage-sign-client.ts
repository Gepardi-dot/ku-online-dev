'use client';

export type StorageSignTransform = {
  width?: number;
  height?: number;
  resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'webp' | 'png' | 'jpeg';
};

type CacheEntry = { url: string; expiresAt: number };

const DEFAULT_TTL_MS = 55 * 60 * 1000;
const SAFETY_SKEW_MS = 30 * 1000;
const MAX_ENTRIES = 2000;
const MAX_PATHS_PER_REQUEST = 100;
const UNAUTHORIZED_COOLDOWN_MS = 60 * 1000;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Record<string, string>>>();
let unauthorizedUntilMs = 0;

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

function cacheKey(path: string, transform?: StorageSignTransform): string {
  return `${stableStringify(transform)}|${path}`;
}

function pruneCache(now: number) {
  for (const [key, entry] of cache) {
    if (!entry || entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (cache.size <= MAX_ENTRIES) {
    return;
  }

  const overflow = cache.size - MAX_ENTRIES;
  const keys = cache.keys();
  for (let i = 0; i < overflow; i += 1) {
    const next = keys.next();
    if (next.done) break;
    cache.delete(next.value);
  }
}

export function clearStorageSignCache() {
  cache.clear();
  inFlight.clear();
  unauthorizedUntilMs = 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function fetchSignedMap(
  missing: string[],
  transform: StorageSignTransform | undefined,
  ttlMs: number,
): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < unauthorizedUntilMs) {
    return {};
  }

  const requestKey = `${stableStringify(transform)}|${missing.join(',')}`;
  const existing = inFlight.get(requestKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const response = await fetch('/api/storage/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: missing, transform }),
    });

    if (response.status === 401) {
      unauthorizedUntilMs = Date.now() + UNAUTHORIZED_COOLDOWN_MS;
      return {};
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failed to sign storage paths (${response.status}): ${body}`);
    }

    const payload = (await response.json().catch(() => ({}))) as {
      map?: Record<string, string>;
      expiresAt?: number;
    };
    const map = payload.map ?? {};
    const serverExpiresAt = typeof payload.expiresAt === 'number' ? payload.expiresAt : null;
    const computedExpiresAt = serverExpiresAt
      ? Math.max(Date.now() + 1000, serverExpiresAt - SAFETY_SKEW_MS)
      : Date.now() + ttlMs;

    for (const path of missing) {
      const url = map[path];
      if (typeof url === 'string' && url.trim().length > 0) {
        cache.set(cacheKey(path, transform), { url, expiresAt: computedExpiresAt });
      }
    }
    pruneCache(Date.now());
    return map;
  })().finally(() => {
    inFlight.delete(requestKey);
  });

  inFlight.set(requestKey, promise);
  return promise;
}

export async function signStoragePaths(
  paths: string[],
  options?: { transform?: StorageSignTransform; ttlMs?: number },
): Promise<Record<string, string>> {
  const now = Date.now();
  const ttlMs = Math.max(1_000, options?.ttlMs ?? DEFAULT_TTL_MS);
  const transform = options?.transform;

  pruneCache(now);

  const uniquePaths = Array.from(new Set(paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)));

  if (!uniquePaths.length) {
    return {};
  }

  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const path of uniquePaths) {
    const key = cacheKey(path, transform);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now && hit.url.trim().length > 0) {
      result[path] = hit.url;
      cache.delete(key);
      cache.set(key, hit);
    } else {
      missing.push(path);
    }
  }

  if (!missing.length) {
    return result;
  }

  for (const part of chunk(missing, MAX_PATHS_PER_REQUEST)) {
    const map = await fetchSignedMap(part, transform, ttlMs);
    for (const path of part) {
      const url = map[path];
      if (typeof url === 'string' && url.trim().length > 0) {
        result[path] = url;
      }
    }
  }

  return result;
}
