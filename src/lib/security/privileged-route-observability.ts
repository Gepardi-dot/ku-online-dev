import { createHash } from 'node:crypto';

import { getClientIdentifier } from './request';

type PrivilegedRouteOutcome = 'denied' | 'failed' | 'misconfigured' | 'rate_limited' | 'succeeded';

type PrivilegedRouteEvent =
  | 'diagnostics_failed'
  | 'forbidden_host'
  | 'forbidden_origin'
  | 'misconfigured'
  | 'mutation_failed'
  | 'mutation_succeeded'
  | 'rate_limited'
  | 'unauthorized';

type SafeContextValue = boolean | number | string | null;

type PrivilegedRouteEventInput = {
  route: string;
  method: string;
  event: PrivilegedRouteEvent;
  outcome: PrivilegedRouteOutcome;
  status: number;
  request: Request;
  reason?: string;
  subject?: Record<string, SafeContextValue | SafeContextValue[] | undefined>;
  retryAfter?: number;
};

export type PrivilegedRouteEventPayload = {
  component: 'privileged-route';
  route: string;
  method: string;
  event: PrivilegedRouteEvent;
  outcome: PrivilegedRouteOutcome;
  status: number;
  timestamp: string;
  request: {
    clientHash?: string;
    host?: string;
    origin?: string;
    requestId?: string;
    userAgentFamily?: string;
  };
  reason?: string;
  retryAfter?: number;
  subject?: Record<string, SafeContextValue | SafeContextValue[]>;
};

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|jwt|key|password|secret|token)/i;

function hashIdentifier(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized || normalized === 'unknown') {
    return undefined;
  }

  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function truncate(value: string, maxLength = 160): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function safeHeaderValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return truncate(normalized.toLowerCase(), 200);
}

function safeOrigin(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return truncate(normalized.toLowerCase(), 200);
  }
}

function safeRequestId(headers: Headers): string | undefined {
  return safeHeaderValue(headers.get('x-vercel-id') ?? headers.get('x-request-id'));
}

function userAgentFamily(userAgent: string | null): string | undefined {
  const normalized = userAgent?.toLowerCase() ?? '';
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes('googlebot')) return 'googlebot';
  if (normalized.includes('bingbot')) return 'bingbot';
  if (normalized.includes('facebookexternalhit')) return 'facebook';
  if (normalized.includes('chrome')) return 'chrome';
  if (normalized.includes('safari')) return 'safari';
  if (normalized.includes('firefox')) return 'firefox';
  if (normalized.includes('curl')) return 'curl';
  if (normalized.includes('node')) return 'node';
  return 'other';
}

function safeSubjectValue(value: SafeContextValue | SafeContextValue[]): SafeContextValue | SafeContextValue[] {
  if (typeof value === 'string') {
    return truncate(value, 160);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? truncate(entry, 160) : entry));
  }

  return value;
}

function sanitizeSubject(
  subject: PrivilegedRouteEventInput['subject'],
): PrivilegedRouteEventPayload['subject'] {
  if (!subject) {
    return undefined;
  }

  const sanitized: Record<string, SafeContextValue | SafeContextValue[]> = {};
  for (const [key, value] of Object.entries(subject)) {
    if (value === undefined || SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    sanitized[key] = safeSubjectValue(value);
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function buildPrivilegedRouteEventPayload(
  input: PrivilegedRouteEventInput,
  now = new Date(),
): PrivilegedRouteEventPayload {
  const { headers } = input.request;
  const payload: PrivilegedRouteEventPayload = {
    component: 'privileged-route',
    route: input.route,
    method: input.method.toUpperCase(),
    event: input.event,
    outcome: input.outcome,
    status: input.status,
    timestamp: now.toISOString(),
    request: {
      clientHash: hashIdentifier(getClientIdentifier(headers)),
      host: safeHeaderValue(headers.get('x-forwarded-host') ?? headers.get('host')),
      origin: safeOrigin(headers.get('origin')),
      requestId: safeRequestId(headers),
      userAgentFamily: userAgentFamily(headers.get('user-agent')),
    },
    reason: input.reason ? truncate(input.reason, 120) : undefined,
    retryAfter: input.retryAfter,
    subject: sanitizeSubject(input.subject),
  };

  return payload;
}

export function reportPrivilegedRouteEvent(input: PrivilegedRouteEventInput): PrivilegedRouteEventPayload {
  const payload = buildPrivilegedRouteEventPayload(input);
  if (input.outcome === 'failed') {
    console.error('[privileged-route]', payload);
  } else if (input.outcome === 'succeeded') {
    console.info('[privileged-route]', payload);
  } else {
    console.warn('[privileged-route]', payload);
  }

  return payload;
}
