import 'server-only';

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

type WindowCounter = { count: number; resetAt: number };

const counters = new Map<string, WindowCounter>();

function getOrInitCounter(key: string, now: number, windowMs: number): WindowCounter {
  const existing = counters.get(key);
  if (existing && existing.resetAt > now) {
    return existing;
  }
  const next: WindowCounter = { count: 0, resetAt: now + windowMs };
  counters.set(key, next);
  return next;
}

function pruneCounters(now: number) {
  for (const [key, counter] of counters) {
    if (!counter || counter.resetAt <= now) {
      counters.delete(key);
    }
  }
}

export function checkRateLimit(options: {
  key: string;
  windowMs: number;
  limit: number;
  now?: number;
}): RateLimitResult {
  const now = options.now ?? Date.now();
  pruneCounters(now);

  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const counter = getOrInitCounter(options.key, now, windowMs);

  if (counter.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((counter.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetAt: counter.resetAt, retryAfterSeconds };
  }

  counter.count += 1;
  const remaining = Math.max(0, limit - counter.count);
  return { allowed: true, remaining, resetAt: counter.resetAt };
}

