import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { createSignedUrls, createTransformedSignedUrls } from '@/lib/storage';

type SignRequest = {
  paths?: string[];
  transform?: {
    width?: number;
    height?: number;
    resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
    quality?: number;
    format?: 'webp' | 'png' | 'jpeg';
  };
};

export const POST = withSentryRoute(async (request: Request) => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as SignRequest;
  const rawPaths = Array.isArray(body.paths) ? body.paths : [];

  // Sanitize and cap the request size for safety
  const paths = rawPaths
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .slice(0, 100);

  if (paths.length === 0) {
    return NextResponse.json({ map: {} });
  }

  const map = body.transform
    ? await createTransformedSignedUrls(paths, body.transform, 60 * 60)
    : await createSignedUrls(paths, 60 * 60);
  return NextResponse.json({ map });
});
