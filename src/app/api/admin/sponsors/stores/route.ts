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

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 30 } as const;

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

type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function getErrorText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getSupabaseErrorMeta(error: SupabaseErrorLike) {
  return {
    code: getErrorText(error.code),
    message: getErrorText(error.message),
    details: getErrorText(error.details),
    hint: getErrorText(error.hint),
  };
}

function extractMissingColumn(error: SupabaseErrorLike): string | null {
  const meta = getSupabaseErrorMeta(error);
  const combined = `${meta.message} ${meta.details} ${meta.hint}`;
  const patterns = [
    /column\s+["']?([a-z0-9_]+)["']?/i,
    /'([a-z0-9_]+)'\s+column/i,
    /with name ['"]([a-z0-9_]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    const column = match?.[1]?.toLowerCase() ?? '';
    if (column) return column;
  }

  return null;
}

async function insertSponsorStoreWithColumnFallback(payload: Record<string, unknown>) {
  const optionalColumns = new Set([
    'owner_user_id',
    'sponsor_tier',
    'is_featured',
    'primary_city',
    'phone',
    'whatsapp',
    'website',
    'description',
    'status',
  ]);

  const workingPayload = { ...payload };
  const droppedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalColumns.size; attempt += 1) {
    const result = await supabaseAdmin
      .from('sponsor_stores')
      .insert(workingPayload)
      .select('id, name, slug, status')
      .single();

    if (!result.error) {
      return { ...result, droppedColumns };
    }

    const meta = getSupabaseErrorMeta(result.error as SupabaseErrorLike);
    const missingColumn = extractMissingColumn(result.error as SupabaseErrorLike);
    const missingColumnError =
      meta.code === '42703' ||
      meta.code === 'PGRST204' ||
      (meta.message.toLowerCase().includes('column') && meta.message.toLowerCase().includes('does not exist')) ||
      (meta.message.toLowerCase().includes('could not find') && meta.message.toLowerCase().includes('column'));

    if (!missingColumnError || !missingColumn || !optionalColumns.has(missingColumn) || !(missingColumn in workingPayload)) {
      return { ...result, droppedColumns };
    }

    delete workingPayload[missingColumn];
    droppedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: {
      code: 'FALLBACK_EXHAUSTED',
      message: 'Could not create sponsor store after removing optional columns.',
      details: droppedColumns.join(','),
      hint: '',
    },
    droppedColumns,
  };
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-sponsor-store:create:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json({ ok: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const userRate = checkRateLimit(`admin-sponsor-store:create:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = CREATE_STORE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const normalizedName = parsed.data.name.trim();
  const preferredSlug = normalizeNullable(parsed.data.slug) ?? normalizedName;
  const normalizedSlug = normalizeSlug(preferredSlug);

  if (normalizedSlug.length < 2) {
    return NextResponse.json(
      { ok: false, error: 'Store slug is invalid. Use letters and numbers.' },
      { status: 400 },
    );
  }

  const insertPayload: Record<string, unknown> = {
    name: normalizedName,
    slug: normalizedSlug,
    description: normalizeNullable(parsed.data.description),
    primary_city: normalizeNullable(parsed.data.primaryCity),
    phone: normalizeNullable(parsed.data.phone),
    whatsapp: normalizeNullable(parsed.data.whatsapp),
    website: normalizeNullable(parsed.data.website),
    status: parsed.data.status,
    sponsor_tier: parsed.data.sponsorTier,
    is_featured: Boolean(parsed.data.isFeatured),
  };

  insertPayload.owner_user_id = parsed.data.ownerUserId ?? user.id;

  const { data, error, droppedColumns } = await insertSponsorStoreWithColumnFallback(insertPayload);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, error: 'Slug already exists. Choose another slug.' }, { status: 409 });
    }
    if (error.code === '23503') {
      return NextResponse.json({ ok: false, error: 'Owner user was not found.' }, { status: 400 });
    }
    const meta = getSupabaseErrorMeta(error as SupabaseErrorLike);
    console.error('Failed to create sponsor store', {
      code: meta.code || null,
      message: meta.message || null,
      details: meta.details || null,
      hint: meta.hint || null,
      droppedColumns: droppedColumns.length ? droppedColumns : null,
    });
    const diagnostic =
      process.env.NODE_ENV !== 'production' && meta.code
        ? `Failed to create store. (${meta.code})`
        : 'Failed to create store.';
    return NextResponse.json({ ok: false, error: diagnostic }, { status: 400 });
  }

  if (droppedColumns.length && process.env.NODE_ENV !== 'production') {
    console.warn('Created sponsor store with schema fallback', { droppedColumns });
  }

  return NextResponse.json({
    ok: true,
    store: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      status: data.status,
    },
  });
}, 'admin-sponsor-store-create');
