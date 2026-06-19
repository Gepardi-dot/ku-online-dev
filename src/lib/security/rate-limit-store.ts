import 'server-only';

import { createHash } from 'node:crypto';

export type FixedWindowRateLimitOptions = {
  key: string;
  windowMs: number;
  limit: number;
  now?: number;
};

export type FixedWindowRateLimitResult =
  | {
      allowed: true;
      remaining: number;
      resetAt: number;
      count: number;
      backend: 'memory' | 'upstash';
    }
  | {
      allowed: false;
      remaining: 0;
      resetAt: number;
      retryAfterSeconds: number;
      count: number;
      backend: 'memory' | 'upstash';
    };

type WindowCounter = { count: number; resetAt: number };
type UpstashConfig = { url: string; token: string };
type UpstashCommandResponse = { result?: unknown; error?: string };

const KEY_PREFIX = 'ku-bazar:rate-limit:v1:';
const memoryCounters = new Map<string, WindowCounter>();
let lastUpstashWarningAt = 0;

const FIXED_WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`.trim();

function getBoundedLimit(limit: number) {
  return Math.max(1, Math.floor(limit));
}

function getBoundedWindowMs(windowMs: number) {
  return Math.max(1_000, Math.floor(windowMs));
}

export function normalizeRateLimitKey(key: string): string {
  const normalized = key.trim() || 'unknown';
  const readable = normalized
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
  const digest = createHash('sha256').update(normalized).digest('base64url').slice(0, 22);
  return `${KEY_PREFIX}${readable}:${digest}`;
}

function getUpstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  return {
    url: url.replace(/\/+$/, ''),
    token,
  };
}

function buildResult(input: {
  count: number;
  limit: number;
  resetAt: number;
  now: number;
  backend: 'memory' | 'upstash';
}): FixedWindowRateLimitResult {
  if (input.count > input.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: input.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((input.resetAt - input.now) / 1000)),
      count: input.count,
      backend: input.backend,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - input.count),
    resetAt: input.resetAt,
    count: input.count,
    backend: input.backend,
  };
}

function getOrInitMemoryCounter(key: string, now: number, windowMs: number): WindowCounter {
  const existing = memoryCounters.get(key);
  if (existing && existing.resetAt > now) {
    return existing;
  }

  const next: WindowCounter = { count: 0, resetAt: now + windowMs };
  memoryCounters.set(key, next);
  return next;
}

function pruneMemoryCounters(now: number) {
  for (const [key, counter] of memoryCounters) {
    if (counter.resetAt <= now) {
      memoryCounters.delete(key);
    }
  }
}

function checkMemoryFixedWindow(options: Required<FixedWindowRateLimitOptions>): FixedWindowRateLimitResult {
  pruneMemoryCounters(options.now);
  const counter = getOrInitMemoryCounter(options.key, options.now, options.windowMs);
  counter.count += 1;

  return buildResult({
    count: counter.count,
    limit: options.limit,
    resetAt: counter.resetAt,
    now: options.now,
    backend: 'memory',
  });
}

function parseUpstashResult(value: unknown): { count: number; ttlMs: number } {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Unexpected Upstash rate-limit response');
  }

  const count = Number(value[0]);
  const ttlMs = Number(value[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new Error('Invalid Upstash rate-limit response');
  }

  return { count, ttlMs };
}

function warnUpstashFallback(error: unknown) {
  const now = Date.now();
  if (now - lastUpstashWarningAt < 60_000) {
    return;
  }
  lastUpstashWarningAt = now;

  const message = error instanceof Error ? error.message : String(error);
  console.warn('[rate-limit] Upstash backend unavailable; using in-memory fallback.', { message });
}

async function checkUpstashFixedWindow(
  config: UpstashConfig,
  options: Required<FixedWindowRateLimitOptions>,
): Promise<FixedWindowRateLimitResult> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['EVAL', FIXED_WINDOW_SCRIPT, 1, options.key, String(options.windowMs)]),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as UpstashCommandResponse | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error || `Upstash request failed with status ${response.status}`);
  }

  const { count, ttlMs } = parseUpstashResult(payload.result);
  const safeTtlMs = ttlMs > 0 ? ttlMs : options.windowMs;
  return buildResult({
    count,
    limit: options.limit,
    resetAt: options.now + safeTtlMs,
    now: options.now,
    backend: 'upstash',
  });
}

export async function checkFixedWindowRateLimit(
  options: FixedWindowRateLimitOptions,
): Promise<FixedWindowRateLimitResult> {
  const normalizedOptions: Required<FixedWindowRateLimitOptions> = {
    key: normalizeRateLimitKey(options.key),
    windowMs: getBoundedWindowMs(options.windowMs),
    limit: getBoundedLimit(options.limit),
    now: options.now ?? Date.now(),
  };

  const upstashConfig = getUpstashConfig();
  if (!upstashConfig) {
    return checkMemoryFixedWindow(normalizedOptions);
  }

  try {
    return await checkUpstashFixedWindow(upstashConfig, normalizedOptions);
  } catch (error) {
    warnUpstashFallback(error);
    return checkMemoryFixedWindow(normalizedOptions);
  }
}

export function resetRateLimitMemoryForTests() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetRateLimitMemoryForTests is only available in tests');
  }
  memoryCounters.clear();
  lastUpstashWarningAt = 0;
}
