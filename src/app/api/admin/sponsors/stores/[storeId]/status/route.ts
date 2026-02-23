import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isAdmin } from '@/lib/auth/roles';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import {
  getSupabaseErrorMeta,
  isSchemaMismatchMeta,
  type SponsorApiErrorCode,
} from '@/lib/sponsors/errors';
import {
  createSponsorRequestId,
  logSponsorError,
  logSponsorInfo,
} from '@/lib/sponsors/logging';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 90 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 24 } as const;
const RATE_LIMIT_PER_STORE = { windowMs: 60_000, max: 8 } as const;
const STATUS_MAX_BODY_BYTES = 4096;

const STORE_ID_SCHEMA = z.string().uuid();
const UPDATE_STATUS_SCHEMA = z.object({
  status: z.enum(['active', 'disabled']),
});

type StatusRpcRow = {
  store_id: string;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
};

function normalizeStoreStatus(value: unknown): 'pending' | 'active' | 'disabled' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'active' || normalized === 'disabled') {
    return normalized;
  }
  return 'pending';
}

function parseContentLength(headers: Headers): number | null {
  const raw = headers.get('content-length');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

function createErrorResponse(args: {
  requestId: string;
  status: number;
  error: string;
  errorCode: SponsorApiErrorCode;
  retryAfterSeconds?: number;
}) {
  const response = NextResponse.json(
    {
      ok: false,
      error: args.error,
      errorCode: args.errorCode,
      requestId: args.requestId,
    },
    { status: args.status },
  );
  if (typeof args.retryAfterSeconds === 'number') {
    response.headers.set('Retry-After', String(Math.max(1, args.retryAfterSeconds)));
  }
  return response;
}

function mapStatusUpdateError(meta: ReturnType<typeof getSupabaseErrorMeta>): {
  status: number;
  error: string;
  errorCode: SponsorApiErrorCode;
} {
  const message = `${meta.message} ${meta.details} ${meta.hint}`;
  if (message.includes('sponsor_store_not_found')) {
    return { status: 404, error: 'Store not found.', errorCode: 'SPONSOR_STORE_NOT_FOUND' };
  }
  if (message.includes('sponsor_store_owner_required')) {
    return {
      status: 400,
      error: 'Store owner is required before approval.',
      errorCode: 'SPONSOR_OWNER_REQUIRED_FOR_APPROVAL',
    };
  }
  if (message.includes('sponsor_invalid_status_transition')) {
    return {
      status: 400,
      error: 'Invalid status transition.',
      errorCode: 'SPONSOR_INVALID_STATUS_TRANSITION',
    };
  }
  if (isSchemaMismatchMeta(meta) || meta.code === '42883') {
    return { status: 500, error: 'Sponsor store schema mismatch.', errorCode: 'SPONSOR_SCHEMA_MISMATCH' };
  }
  return { status: 400, error: 'Failed to update store status.', errorCode: 'SPONSOR_DB_WRITE_FAILED' };
}

export const PATCH = withSentryRoute(async (request: Request, ctx: { params: Promise<{ storeId: string }> }) => {
  const route = 'admin-sponsor-store-status-update';
  const requestId = createSponsorRequestId();
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    logSponsorError({
      requestId,
      route,
      action: 'status_update.forbidden_origin',
      error: { message: 'forbidden origin' },
    });
    return createErrorResponse({
      requestId,
      status: 403,
      error: 'Forbidden origin',
      errorCode: 'SPONSOR_FORBIDDEN_ORIGIN',
    });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-store:status:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      logSponsorError({
        requestId,
        route,
        action: 'status_update.rate_limited_ip',
        error: { message: 'ip rate limited' },
        extra: { clientIdentifier },
      });
      return createErrorResponse({
        requestId,
        status: 429,
        error: 'Too many requests. Please wait a moment.',
        errorCode: 'SPONSOR_RATE_LIMITED',
        retryAfterSeconds: ipRate.retryAfter,
      });
    }
  }

  const rawStoreId = (await ctx.params).storeId;
  const parsedStoreId = STORE_ID_SCHEMA.safeParse(rawStoreId);
  if (!parsedStoreId.success) {
    return createErrorResponse({
      requestId,
      status: 400,
      error: 'Invalid store id.',
      errorCode: 'SPONSOR_INVALID_PAYLOAD',
    });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user)) {
    return createErrorResponse({
      requestId,
      status: 401,
      error: 'Not authorized',
      errorCode: 'SPONSOR_NOT_AUTHORIZED',
    });
  }

  const userRate = checkRateLimit(`admin-sponsor-store:status:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    logSponsorError({
      requestId,
      route,
      action: 'status_update.rate_limited_user',
      actorUserId: user.id,
      storeId: parsedStoreId.data,
      error: { message: 'user rate limited' },
    });
    return createErrorResponse({
      requestId,
      status: 429,
      error: 'Too many requests. Please try again later.',
      errorCode: 'SPONSOR_RATE_LIMITED',
      retryAfterSeconds: userRate.retryAfter,
    });
  }

  const storeRate = checkRateLimit(`admin-sponsor-store:status:store:${parsedStoreId.data}`, RATE_LIMIT_PER_STORE);
  if (!storeRate.success) {
    logSponsorError({
      requestId,
      route,
      action: 'status_update.rate_limited_store',
      actorUserId: user.id,
      storeId: parsedStoreId.data,
      error: { message: 'store rate limited' },
    });
    return createErrorResponse({
      requestId,
      status: 429,
      error: 'Too many status changes for this store. Please wait and try again.',
      errorCode: 'SPONSOR_RATE_LIMITED',
      retryAfterSeconds: storeRate.retryAfter,
    });
  }

  const contentLength = parseContentLength(request.headers);
  if (contentLength !== null && contentLength > STATUS_MAX_BODY_BYTES) {
    logSponsorError({
      requestId,
      route,
      action: 'status_update.payload_too_large',
      actorUserId: user.id,
      storeId: parsedStoreId.data,
      error: { message: 'payload too large' },
      extra: { contentLength },
    });
    return createErrorResponse({
      requestId,
      status: 413,
      error: 'Payload too large.',
      errorCode: 'SPONSOR_INVALID_PAYLOAD',
    });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsedBody = UPDATE_STATUS_SCHEMA.safeParse(body);
  if (!parsedBody.success) {
    return createErrorResponse({
      requestId,
      status: 400,
      error: 'Invalid payload',
      errorCode: 'SPONSOR_INVALID_PAYLOAD',
    });
  }

  const { data, error } = await supabaseAdmin
    .rpc('admin_set_sponsor_store_status', {
      p_store_id: parsedStoreId.data,
      p_status: parsedBody.data.status,
      p_actor: user.id,
    })
    .single();

  if (error) {
    const meta = getSupabaseErrorMeta(error);
    const mapped = mapStatusUpdateError(meta);
    logSponsorError({
      requestId,
      route,
      action: 'status_update.failed',
      actorUserId: user.id,
      storeId: parsedStoreId.data,
      status: parsedBody.data.status,
      error,
    });
    return createErrorResponse({
      requestId,
      status: mapped.status,
      error: mapped.error,
      errorCode: mapped.errorCode,
    });
  }

  const row = data as unknown as StatusRpcRow;
  const nextStatus = normalizeStoreStatus(row.status);
  logSponsorInfo({
    requestId,
    route,
    action: 'status_update.succeeded',
    actorUserId: user.id,
    storeId: row.store_id,
    status: nextStatus,
  });

  return NextResponse.json({
    ok: true,
    requestId,
    store: {
      id: row.store_id,
      status: nextStatus,
      approvedAt: row.approved_at ?? null,
      approvedBy: row.approved_by ?? null,
      disabledAt: row.disabled_at ?? null,
      disabledBy: row.disabled_by ?? null,
    },
  });
}, 'admin-sponsor-store-status-update');
