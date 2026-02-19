import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getEnv } from '@/lib/env';
import { persistDurablePwaTelemetryBatch } from '@/lib/pwa/telemetry-durable';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { recordPwaTelemetryBatch } from '@/lib/pwa/telemetry-store';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const telemetryEnabled = env.NEXT_PUBLIC_PWA_ENABLED && env.NEXT_PUBLIC_PWA_TELEMETRY_ENABLED;

const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const RATE_IP = { windowMs: 60_000, max: 120 } as const;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 120_000;
const SYNTHETIC_TRAFFIC_PATTERNS = [
  /lighthouse/i,
  /chrome-lighthouse/i,
  /headlesschrome/i,
  /pagespeed/i,
  /gtmetrix/i,
];

const telemetryMetaSchema = z.record(
  z.string().min(1).max(48),
  z.union([z.string().max(160), z.number().finite(), z.boolean(), z.null()]),
);

const telemetryEventSchema = z
  .object({
    type: z.enum(['web_vital', 'pwa_lifecycle']),
    name: z.string().min(1).max(64),
    ts: z.number().int().nonnegative(),
    path: z.string().min(1).max(180),
    value: z.number().finite().optional(),
    unit: z.enum(['ms', 'score', 'count']).optional(),
    rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
    id: z.string().max(96).optional(),
    meta: telemetryMetaSchema.optional(),
  })
  .strict();

const payloadSchema = z
  .object({
    events: z.array(telemetryEventSchema).min(1).max(20),
    context: z
      .object({
        href: z.string().url().max(300).optional(),
        ua: z.string().max(260).optional(),
        displayMode: z.enum(['standalone', 'browser', 'unknown']),
        language: z.string().max(24).optional(),
        tzOffset: z.number().int().min(-840).max(840).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function ensureTelemetryEnabled() {
  if (!telemetryEnabled) {
    return NextResponse.json({ error: 'PWA telemetry is disabled' }, { status: 503 });
  }
  return null;
}

function validateOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }
  return null;
}

function validateIpRateLimit(headers: Headers) {
  const clientIdentifier = getClientIdentifier(headers);
  if (clientIdentifier === 'unknown') {
    return null;
  }

  const result = checkRateLimit(`pwa-telemetry:ip:${clientIdentifier}`, RATE_IP);
  if (!result.success) {
    return tooManyRequestsResponse(result.retryAfter, 'Too many telemetry requests. Try again later.');
  }

  return null;
}

function isEventTimestampValid(eventTimestamp: number, now: number) {
  if (eventTimestamp > now + MAX_FUTURE_SKEW_MS) {
    return false;
  }
  if (eventTimestamp < now - MAX_EVENT_AGE_MS) {
    return false;
  }
  return true;
}

function isSyntheticTraffic(request: Request, contextUa: string | undefined) {
  const headerUa = request.headers.get('user-agent') ?? '';
  const combinedUa = `${headerUa} ${contextUa ?? ''}`.trim();
  if (!combinedUa) {
    return false;
  }
  return SYNTHETIC_TRAFFIC_PATTERNS.some((pattern) => pattern.test(combinedUa));
}

export const POST = withSentryRoute(async (request: Request) => {
  const disabled = ensureTelemetryEnabled();
  if (disabled) return disabled;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const rateError = validateIpRateLimit(request.headers);
  if (rateError) return rateError;

  const payload = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid telemetry payload' }, { status: 400 });
  }

  if (isSyntheticTraffic(request, parsed.data.context?.ua)) {
    return NextResponse.json({
      ok: true,
      accepted: 0,
      durablePersisted: 0,
      durableEnabled: env.PWA_TELEMETRY_DURABLE_ENABLED,
      skipped: 'synthetic_traffic',
    });
  }

  const now = Date.now();
  const acceptedEvents = parsed.data.events.filter((event) => isEventTimestampValid(event.ts, now));
  if (acceptedEvents.length === 0) {
    return NextResponse.json({ error: 'No valid telemetry events' }, { status: 400 });
  }

  recordPwaTelemetryBatch(acceptedEvents, {
    displayMode: parsed.data.context?.displayMode,
  });
  const durableResult = await persistDurablePwaTelemetryBatch(acceptedEvents, {
    displayMode: parsed.data.context?.displayMode,
  });

  const webVitalEvents = acceptedEvents.filter((event) => event.type === 'web_vital');
  const poorVitalEvents = webVitalEvents.filter((event) => event.rating === 'poor');
  const lifecycleEvents = acceptedEvents.filter((event) => event.type === 'pwa_lifecycle');
  const hasFailureLifecycleSignal = lifecycleEvents.some(
    (event) => event.name.includes('failed') || event.name.includes('denied'),
  );

  if (process.env.NODE_ENV !== 'production' || poorVitalEvents.length > 0 || hasFailureLifecycleSignal) {
    console.info(
      '[pwa-telemetry]',
      JSON.stringify({
        count: acceptedEvents.length,
        displayMode: parsed.data.context?.displayMode ?? 'unknown',
        pathSample: acceptedEvents[0]?.path ?? '/',
        webVitals: webVitalEvents.map((event) => ({
          name: event.name,
          value: event.value,
          rating: event.rating,
          unit: event.unit,
        })),
        lifecycleSignals: lifecycleEvents.map((event) => event.name),
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    accepted: acceptedEvents.length,
    durablePersisted: durableResult.persisted,
    durableEnabled: !durableResult.skipped,
  });
}, 'pwa-telemetry');
