import { checkFixedWindowRateLimit } from './rate-limit-store';

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

export async function checkRateLimit(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const result = await checkFixedWindowRateLimit({
    key: identifier,
    windowMs: options.windowMs,
    limit: options.max,
  });

  if (!result.allowed) {
    return {
      success: false,
      retryAfter: result.retryAfterSeconds,
    };
  }

  return {
    success: true,
    remaining: result.remaining,
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

export function isSameOriginRequest(request: Request): boolean {
  const originHeader = request.headers.get('origin');
  if (!originHeader) {
    return false;
  }

  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!forwardedHost) {
    return false;
  }

  try {
    const originUrl = new URL(originHeader);
    const originHost = originUrl.host.toLowerCase();
    const requestHost = forwardedHost.split(',')[0]?.trim().toLowerCase();

    if (!requestHost || originHost !== requestHost) {
      return false;
    }

    const forwardedProto = request.headers.get('x-forwarded-proto');
    if (!forwardedProto) {
      return true;
    }

    const requestProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
    if (!requestProto) {
      return true;
    }

    return originUrl.protocol.toLowerCase() === `${requestProto}:`;
  } catch {
    return false;
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
