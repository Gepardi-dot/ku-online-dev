import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 40 } as const;
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'https://www.kubazar.net',
  'https://kubazar.net',
  'http://localhost:5000',
]);

const STORE_SELECT = `
  id,
  name,
  slug,
  status,
  primary_city,
  phone,
  whatsapp,
  website,
  owner_user_id,
  owner:users!sponsor_stores_owner_user_id_fkey(id, email, phone, full_name, name)
`;

type OwnerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  name: string | null;
};

type StoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  primary_city: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  owner_user_id: string | null;
  owner: OwnerRow | OwnerRow[] | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function searchToken(value: string): string {
  return value.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function asOwner(value: StoreRow['owner']): OwnerRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ ok: false, error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const GET = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = await checkRateLimit(`admin-sponsor-product-lookup:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests. Please wait a moment.');
    }
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
  }

  const userRate = await checkRateLimit(`admin-sponsor-product-lookup:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Too many requests. Please try again later.');
  }

  if (!supabaseServiceRole) {
    return NextResponse.json({ ok: false, error: 'Server is not configured.' }, { status: 500 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  const token = searchToken(query);
  if (token.length < 3 && !isUuid(query)) {
    return NextResponse.json({ ok: false, error: 'Enter at least 3 characters.' }, { status: 400 });
  }

  const storesById = new Map<string, StoreRow>();
  const remember = (rows: StoreRow[] | null) => {
    for (const row of rows ?? []) {
      if (row?.id) storesById.set(row.id, row);
    }
  };

  if (isUuid(query)) {
    const byId = await supabaseServiceRole.from('sponsor_stores').select(STORE_SELECT).eq('id', query).limit(1);
    if (byId.error) {
      console.error('Failed to look up sponsor store by id', byId.error);
      return NextResponse.json({ ok: false, error: 'Unable to search stores.' }, { status: 500 });
    }
    remember(byId.data as StoreRow[] | null);

    const byOwner = await supabaseServiceRole
      .from('sponsor_stores')
      .select(STORE_SELECT)
      .eq('owner_user_id', query)
      .limit(8);
    if (byOwner.error) {
      console.error('Failed to look up sponsor stores by owner id', byOwner.error);
      return NextResponse.json({ ok: false, error: 'Unable to search stores.' }, { status: 500 });
    }
    remember(byOwner.data as StoreRow[] | null);
  } else {
    const pattern = `"%${token.replace(/"/g, '')}%"`;
    const byStore = await supabaseServiceRole
      .from('sponsor_stores')
      .select(STORE_SELECT)
      .or(`name.ilike.${pattern},slug.ilike.${pattern},phone.ilike.${pattern},whatsapp.ilike.${pattern}`)
      .limit(8);
    if (byStore.error) {
      console.error('Failed to look up sponsor stores', byStore.error);
      return NextResponse.json({ ok: false, error: 'Unable to search stores.' }, { status: 500 });
    }
    remember(byStore.data as StoreRow[] | null);

    let ownerQuery = supabaseServiceRole.from('users').select('id').limit(8);
    ownerQuery = query.includes('@')
      ? ownerQuery.ilike('email', pattern)
      : ownerQuery.or(`phone.ilike.${pattern},full_name.ilike.${pattern},name.ilike.${pattern}`);
    const owners = await ownerQuery;
    if (owners.error) {
      console.error('Failed to look up store owners', owners.error);
      return NextResponse.json({ ok: false, error: 'Unable to search stores.' }, { status: 500 });
    }
    const ownerIds = (owners.data ?? []).map((row) => row.id).filter(Boolean);
    if (ownerIds.length) {
      const byOwners = await supabaseServiceRole
        .from('sponsor_stores')
        .select(STORE_SELECT)
        .in('owner_user_id', ownerIds)
        .limit(8);
      if (byOwners.error) {
        console.error('Failed to look up stores for matching owners', byOwners.error);
        return NextResponse.json({ ok: false, error: 'Unable to search stores.' }, { status: 500 });
      }
      remember(byOwners.data as StoreRow[] | null);
    }
  }

  const stores = Array.from(storesById.values())
    .slice(0, 8)
    .map((row) => {
      const owner = asOwner(row.owner);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        city: row.primary_city,
        phone: row.phone,
        whatsapp: row.whatsapp,
        website: row.website,
        owner: owner
          ? {
              id: owner.id,
              email: owner.email,
              phone: owner.phone,
              full_name: owner.full_name,
              name: owner.name,
            }
          : null,
      };
    });

  return NextResponse.json({ ok: true, stores });
});
