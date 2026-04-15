import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const { ADMIN_REVALIDATE_TOKEN, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;

const supabaseAdmin = createSupabaseAdmin(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ANNOUNCEMENTS_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 3 } as const;
const ANNOUNCEMENTS_RATE_LIMIT_PER_TOKEN = { windowMs: 60_000, max: 10 } as const;

const adminOriginAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

function tooManyRequestsResponse(retryAfter: number) {
  const response = NextResponse.json({ error: 'Rate limit exceeded. Wait before publishing another announcement.' }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function isAuthorized(req: Request): boolean {
  const token = req.headers.get('x-admin-token') ?? '';
  const expected = ADMIN_REVALIDATE_TOKEN ?? '';
  return Boolean(expected) && token === expected;
}

function isValidDateString(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

type Body = {
  title?: string;
  body?: string;
  severity?: 'info' | 'warning' | 'critical';
  startsAt?: string | null;
  endsAt?: string | null;
};

export const POST = withSentryRoute(async (req: NextRequest) => {
  const originHeader = req.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, adminOriginAllowList) && !isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(req.headers);
  if (clientIdentifier !== 'unknown') {
    const rate = checkRateLimit(`admin-announcements:ip:${clientIdentifier}`, ANNOUNCEMENTS_RATE_LIMIT_PER_IP);
    if (!rate.success) {
      return tooManyRequestsResponse(rate.retryAfter);
    }
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokenRate = checkRateLimit('admin-announcements:token', ANNOUNCEMENTS_RATE_LIMIT_PER_TOKEN);
  if (!tokenRate.success) {
    return tooManyRequestsResponse(tokenRate.retryAfter);
  }

  const payload = (await req.json().catch(() => ({}))) as Body;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const severity = payload.severity ?? 'info';

  if (!title || title.length > 140) {
    return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
  }
  if (!body || body.length > 4000) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!['info', 'warning', 'critical'].includes(severity)) {
    return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
  }

  const startsAt = typeof payload.startsAt === 'string' ? payload.startsAt : null;
  const endsAt = typeof payload.endsAt === 'string' ? payload.endsAt : null;

  if (startsAt && !isValidDateString(startsAt)) {
    return NextResponse.json({ error: 'Invalid startsAt' }, { status: 400 });
  }
  if (endsAt && !isValidDateString(endsAt)) {
    return NextResponse.json({ error: 'Invalid endsAt' }, { status: 400 });
  }
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return NextResponse.json({ error: 'endsAt must be after startsAt' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('publish_announcement', {
    p_title: title,
    p_body: body,
    p_severity: severity,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (error) {
    console.error('Failed to publish announcement', error);
    return NextResponse.json({ error: 'Failed to publish announcement' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, announcementId: data ?? null });
}, 'admin-announcements');
