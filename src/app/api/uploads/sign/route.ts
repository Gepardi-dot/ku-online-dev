import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { withSentryRoute } from '@/utils/sentry-route';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
} = getEnv();

const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST = withSentryRoute(async (request: Request) => {
  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
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
