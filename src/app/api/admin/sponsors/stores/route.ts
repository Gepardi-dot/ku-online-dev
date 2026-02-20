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

const CREATE_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const CREATE_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 30 } as const;
const LIST_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;
const LIST_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 120 } as const;
const LIST_LIMIT = 200;

const CREATE_STORE_SCHEMA = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  primaryCity: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(512).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  status: z.enum(['pending', 'active', 'disabled']).default('active'),
  sponsorTier: z.enum(['basic', 'featured']).default('basic'),
  isFeatured: z.boolean().optional().default(false),
});

const LIST_STATUS_SCHEMA = z.enum(['pending', 'active', 'disabled']);

type SponsorStoreStatus = 'pending' | 'active' | 'disabled';

type CreateStoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  owner_user_id: string | null;
};

type ListStoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  owner_user_id: string | null;
  primary_city: string | null;
  sponsor_tier: string | null;
  is_featured: boolean | null;
  updated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
};

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeSlug(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug.slice(0, 80);
}

function normalizeStoreStatus(value: unknown): SponsorStoreStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'active' || normalized === 'disabled') {
    return normalized;
  }
  return 'pending';
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

function mapCreateStoreFailure(meta: ReturnType<typeof getSupabaseErrorMeta>): {
  status: number;
  error: string;
  errorCode: SponsorApiErrorCode;
} {
  if (meta.code === '23505') {
    return { status: 409, error: 'Slug already exists. Choose another slug.', errorCode: 'SPONSOR_SLUG_CONFLICT' };
  }
  if (meta.code === '23503') {
    return { status: 400, error: 'Owner user was not found.', errorCode: 'SPONSOR_OWNER_NOT_FOUND' };
  }
  if (isSchemaMismatchMeta(meta)) {
    return { status: 500, error: 'Sponsor store schema mismatch.', errorCode: 'SPONSOR_SCHEMA_MISMATCH' };
  }
  return { status: 400, error: 'Failed to create store.', errorCode: 'SPONSOR_DB_WRITE_FAILED' };
}

function mapListStoreFailure(meta: ReturnType<typeof getSupabaseErrorMeta>): {
  status: number;
  error: string;
  errorCode: SponsorApiErrorCode;
} {
  if (isSchemaMismatchMeta(meta)) {
    return { status: 500, error: 'Sponsor store schema mismatch.', errorCode: 'SPONSOR_SCHEMA_MISMATCH' };
  }
  return { status: 400, error: 'Failed to load stores.', errorCode: 'SPONSOR_DB_READ_FAILED' };
}

async function ensureAdminUser(requestId: string) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user)) {
    return {
      user: null,
      response: createErrorResponse({
        requestId,
        status: 401,
        error: 'Not authorized',
        errorCode: 'SPONSOR_NOT_AUTHORIZED',
      }),
    };
  }

  return { user, response: null };
}

export const GET = withSentryRoute(async (request: Request) => {
  const route = 'admin-sponsor-stores-list';
  const requestId = createSponsorRequestId();
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    logSponsorError({
      requestId,
      route,
      action: 'list.forbidden_origin',
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
    const ipRate = checkRateLimit(`admin-sponsor-store:list:ip:${clientIdentifier}`, LIST_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return createErrorResponse({
        requestId,
        status: 429,
        error: 'Too many requests. Please wait a moment.',
        errorCode: 'SPONSOR_RATE_LIMITED',
        retryAfterSeconds: ipRate.retryAfter,
      });
    }
  }

  const adminCheck = await ensureAdminUser(requestId);
  if (adminCheck.response) {
    return adminCheck.response;
  }
  const user = adminCheck.user;

  const userRate = checkRateLimit(`admin-sponsor-store:list:user:${user.id}`, LIST_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return createErrorResponse({
      requestId,
      status: 429,
      error: 'Too many requests. Please try again later.',
      errorCode: 'SPONSOR_RATE_LIMITED',
      retryAfterSeconds: userRate.retryAfter,
    });
  }

  const url = new URL(request.url);
  const rawStatus = (url.searchParams.get('status') ?? '').trim().toLowerCase();
  const rawSearch = (url.searchParams.get('q') ?? '').trim();

  let statusFilter: SponsorStoreStatus | null = null;
  if (rawStatus) {
    const parsedStatus = LIST_STATUS_SCHEMA.safeParse(rawStatus);
    if (!parsedStatus.success) {
      return createErrorResponse({
        requestId,
        status: 400,
        error: 'Invalid status filter.',
        errorCode: 'SPONSOR_INVALID_PAYLOAD',
      });
    }
    statusFilter = parsedStatus.data;
  }

  if (rawSearch.length > 140) {
    return createErrorResponse({
      requestId,
      status: 400,
      error: 'Search query is too long.',
      errorCode: 'SPONSOR_INVALID_PAYLOAD',
    });
  }

  let query = supabaseAdmin
    .from('sponsor_stores')
    .select(
      'id, name, slug, status, owner_user_id, primary_city, sponsor_tier, is_featured, updated_at, approved_at, approved_by, disabled_at, disabled_by',
    )
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  if (rawSearch) {
    const escaped = rawSearch.replace(/[%_]/g, '\\$&');
    query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    const meta = getSupabaseErrorMeta(error);
    const mapped = mapListStoreFailure(meta);
    logSponsorError({
      requestId,
      route,
      action: 'list.failed',
      actorUserId: user.id,
      error,
      extra: { statusFilter, rawSearch: rawSearch || null },
    });
    return createErrorResponse({
      requestId,
      status: mapped.status,
      error: mapped.error,
      errorCode: mapped.errorCode,
    });
  }

  const stores = (data ?? []).map((row) => row as unknown as ListStoreRow).map((row) => ({
    id: row.id,
    name: row.name ?? 'Store',
    slug: row.slug ?? row.id,
    status: normalizeStoreStatus(row.status),
    ownerUserId: row.owner_user_id ?? null,
    primaryCity: row.primary_city ?? null,
    sponsorTier: row.sponsor_tier ?? 'basic',
    isFeatured: Boolean(row.is_featured),
    updatedAt: row.updated_at ?? null,
    approvedAt: row.approved_at ?? null,
    approvedBy: row.approved_by ?? null,
    disabledAt: row.disabled_at ?? null,
    disabledBy: row.disabled_by ?? null,
  }));

  logSponsorInfo({
    requestId,
    route,
    action: 'list.succeeded',
    actorUserId: user.id,
    status: statusFilter,
    extra: { count: stores.length },
  });

  return NextResponse.json({
    ok: true,
    requestId,
    stores,
  });
}, 'admin-sponsor-store-list');

export const POST = withSentryRoute(async (request: Request) => {
  const route = 'admin-sponsor-store-create';
  const requestId = createSponsorRequestId();
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    logSponsorError({
      requestId,
      route,
      action: 'create.forbidden_origin',
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
    const ipRate = checkRateLimit(`admin-sponsor-store:create:ip:${clientIdentifier}`, CREATE_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return createErrorResponse({
        requestId,
        status: 429,
        error: 'Too many requests. Please wait a moment.',
        errorCode: 'SPONSOR_RATE_LIMITED',
        retryAfterSeconds: ipRate.retryAfter,
      });
    }
  }

  const adminCheck = await ensureAdminUser(requestId);
  if (adminCheck.response) {
    return adminCheck.response;
  }
  const user = adminCheck.user;

  const userRate = checkRateLimit(`admin-sponsor-store:create:user:${user.id}`, CREATE_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return createErrorResponse({
      requestId,
      status: 429,
      error: 'Too many requests. Please try again later.',
      errorCode: 'SPONSOR_RATE_LIMITED',
      retryAfterSeconds: userRate.retryAfter,
    });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = CREATE_STORE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      requestId,
      status: 400,
      error: 'Invalid payload',
      errorCode: 'SPONSOR_INVALID_PAYLOAD',
    });
  }

  const normalizedName = parsed.data.name.trim();
  const preferredSlug = normalizeNullable(parsed.data.slug) ?? normalizedName;
  const normalizedSlug = normalizeSlug(preferredSlug);
  if (normalizedSlug.length < 2) {
    return createErrorResponse({
      requestId,
      status: 400,
      error: 'Store slug is invalid. Use letters and numbers.',
      errorCode: 'SPONSOR_INVALID_PAYLOAD',
    });
  }

  const insertPayload = {
    name: normalizedName,
    slug: normalizedSlug,
    description: normalizeNullable(parsed.data.description),
    primary_city: normalizeNullable(parsed.data.primaryCity),
    phone: normalizeNullable(parsed.data.phone),
    whatsapp: normalizeNullable(parsed.data.whatsapp),
    website: normalizeNullable(parsed.data.website),
    status: 'pending' as const,
    sponsor_tier: parsed.data.sponsorTier,
    is_featured: Boolean(parsed.data.isFeatured),
    owner_user_id: parsed.data.ownerUserId ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('sponsor_stores')
    .insert(insertPayload)
    .select('id, name, slug, status, owner_user_id')
    .single();

  if (error) {
    const meta = getSupabaseErrorMeta(error);
    const mapped = mapCreateStoreFailure(meta);
    logSponsorError({
      requestId,
      route,
      action: 'create.failed',
      actorUserId: user.id,
      error,
      extra: { slug: normalizedSlug },
    });
    return createErrorResponse({
      requestId,
      status: mapped.status,
      error: mapped.error,
      errorCode: mapped.errorCode,
    });
  }

  const created = data as unknown as CreateStoreRow;
  const storeId = created.id;

  const { error: auditError } = await supabaseAdmin.from('sponsor_audit_logs').insert({
    actor_id: user.id,
    action: 'sponsor.store.created',
    entity_type: 'sponsor_store',
    entity_id: storeId,
    metadata: {
      status: 'pending',
      owner_user_id: created.owner_user_id,
      created_via: 'admin_api',
    },
  });

  if (auditError) {
    const { error: rollbackError } = await supabaseAdmin.from('sponsor_stores').delete().eq('id', storeId);
    logSponsorError({
      requestId,
      route,
      action: 'create.audit_failed',
      actorUserId: user.id,
      storeId,
      error: auditError,
      extra: { rollbackFailed: Boolean(rollbackError) },
    });
    if (rollbackError) {
      logSponsorError({
        requestId,
        route,
        action: 'create.rollback_failed',
        actorUserId: user.id,
        storeId,
        error: rollbackError,
      });
    }
    return createErrorResponse({
      requestId,
      status: 500,
      error: 'Failed to record store lifecycle audit log.',
      errorCode: 'SPONSOR_AUDIT_LOG_FAILED',
    });
  }

  logSponsorInfo({
    requestId,
    route,
    action: 'create.succeeded',
    actorUserId: user.id,
    storeId,
    status: 'pending',
  });

  return NextResponse.json({
    ok: true,
    requestId,
    store: {
      id: created.id,
      name: created.name ?? normalizedName,
      slug: created.slug ?? normalizedSlug,
      status: normalizeStoreStatus(created.status),
    },
  });
}, 'admin-sponsor-store-create');
