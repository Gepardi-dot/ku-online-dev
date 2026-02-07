import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isAdmin, isModerator } from '@/lib/auth/roles';
import { getAppContacts, normalizeAppContactsInput } from '@/lib/services/app-contacts';
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

const UPDATE_CONTACTS_SCHEMA = z.object({
  supportEmail: z.string().trim().max(255).nullable().optional(),
  supportWhatsapp: z.string().trim().max(64).nullable().optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 60 } as const;

const EMAIL_SCHEMA = z.string().email();
const WHATSAPP_REGEX = /^\+[0-9]{7,20}$/;

export const GET = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 401 });
  }

  const contacts = await getAppContacts();
  return NextResponse.json({ ok: true, contacts });
}, 'admin-app-contacts-get');

export const PATCH = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`admin-app-contacts:update:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
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

  const userRate = checkRateLimit(`admin-app-contacts:update:user:${user.id}`, RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = UPDATE_CONTACTS_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const normalized = normalizeAppContactsInput(parsed.data);
  if (normalized.supportEmail && !EMAIL_SCHEMA.safeParse(normalized.supportEmail).success) {
    return NextResponse.json({ ok: false, error: 'Email is invalid.' }, { status: 400 });
  }
  if (normalized.supportWhatsapp && !WHATSAPP_REGEX.test(normalized.supportWhatsapp)) {
    return NextResponse.json({ ok: false, error: 'WhatsApp number is invalid.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('app_settings').upsert(
    {
      id: true,
      support_email: normalized.supportEmail,
      support_whatsapp: normalized.supportWhatsapp,
      updated_by: user.id,
    },
    { onConflict: 'id' },
  );

  if (error) {
    console.error('Failed to update app contacts', error);
    return NextResponse.json({ ok: false, error: 'Failed to update contacts.' }, { status: 400 });
  }

  const contacts = await getAppContacts();
  return NextResponse.json({ ok: true, contacts });
}, 'admin-app-contacts-update');

