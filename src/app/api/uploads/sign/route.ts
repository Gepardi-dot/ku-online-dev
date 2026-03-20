import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { withSentryRoute } from '@/utils/sentry-route';

const {
  NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
} = getEnv();

const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SIGN_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 60 } as const;
const SIGN_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 30 } as const;
const uploadSignOriginAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, uploadSignOriginAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`upload-sign:ip:${clientIdentifier}`, SIGN_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests from this network. Please try again later.');
    }
  }

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const userRate = checkRateLimit(`upload-sign:user:${user.id}`, SIGN_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Rate limit reached. Please wait before trying again.');
  }

  const body = await request.json().catch(() => null) as { extension?: string; contentType?: string; kind?: 'avatar' | 'product' } | null;

  const rawExtension = body?.extension?.toLowerCase()?.trim();
  if (!rawExtension || !ALLOWED_EXTENSIONS.has(rawExtension)) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
  }

  const extension = rawExtension === 'jpeg' ? 'jpg' : rawExtension;
  const requestedType = body?.contentType ?? '';
  const contentType = ALLOWED_MIME_TYPES.has(requestedType)
    ? requestedType
    : extension === 'jpg'
      ? 'image/jpeg'
      : `image/${extension}`;

  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const prefix = body?.kind === 'avatar' ? `public/avatars/${user.id}` : `${user.id}`;
  const storagePath = `${prefix}/${fileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    console.error('Failed to create signed upload URL', error);
    return NextResponse.json({ error: 'Unable to prepare upload. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    path: storagePath,
    token: data.token,
    contentType,
  });
});
