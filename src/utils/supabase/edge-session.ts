import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { getPublicEnv } from '@/lib/env-public';

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https';
  }

  if (request.nextUrl.protocol) {
    return request.nextUrl.protocol === 'https:';
  }

  return process.env.NODE_ENV === 'production';
}

function getCookieOptions(request: NextRequest): CookieOptionsWithName {
  return {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: isSecureRequest(request),
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: getCookieOptions(request),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}
