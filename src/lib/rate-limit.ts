import 'server-only';

import { checkFixedWindowRateLimit } from './security/rate-limit-store';

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

export async function checkRateLimit(options: {
  key: string;
  windowMs: number;
  limit: number;
  now?: number;
}): Promise<RateLimitResult> {
  const result = await checkFixedWindowRateLimit(options);
  if (!result.allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: result.resetAt,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: result.remaining,
    resetAt: result.resetAt,
  };
}
