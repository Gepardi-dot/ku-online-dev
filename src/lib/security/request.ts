type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitResult = {
  success: true;
  remaining: number;
} | {
  success: false;
  retryAfter: number;
};

const rateLimitStore = new Map<string, { count: number; expiresAt: number }>();

export function getClientIdentifier(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || forwarded.trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const fallback = headers.get('cf-connecting-ip') ?? headers.get('fastly-client-ip');
  if (fallback) {
    return fallback.trim();
  }

  return 'unknown';
}

export function checkRateLimit(identifier: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.expiresAt <= now) {
    rateLimitStore.set(identifier, {
      count: 1,
      expiresAt: now + options.windowMs,
    });
    return { success: true, remaining: options.max - 1 };
  }

  if (entry.count >= options.max) {
    return {
      success: false,
      retryAfter: Math.ceil((entry.expiresAt - now) / 1000),
    };
  }

  entry.count += 1;
  return {
    success: true,
    remaining: options.max - entry.count,
  };
}

export function isOriginAllowed(originHeader: string | null, allowList: Set<string>): boolean {
  if (!originHeader) {
    return false;
  }

  try {
    const url = new URL(originHeader);
    const origin = `${url.protocol}//${url.host}`.toLowerCase();
    if (allowList.has(origin)) {
      return true;
    }

    // Also allow bare host matches in case headers omit protocol.
    return allowList.has(url.host.toLowerCase());
  } catch {
    return allowList.has(originHeader.toLowerCase());
  }
}

export function buildOriginAllowList(values: Array<string | null | undefined>): Set<string> {
  const list = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    try {
      const url = new URL(value);
      list.add(`${url.protocol}//${url.host}`.toLowerCase());
      list.add(url.host.toLowerCase());
    } catch {
      list.add(value.toLowerCase());
    }
  }
  return list;
}
