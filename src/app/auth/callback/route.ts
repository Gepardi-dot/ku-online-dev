import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

const FALLBACK_APP_ORIGIN = 'http://localhost:5000';

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
      url.hostname = 'localhost';
    }
    return url.origin;
  } catch {
    return FALLBACK_APP_ORIGIN;
  }
}

function resolveNextPath(nextParam: string | null): string {
  if (!nextParam) {
    return '/';
  }

  if (nextParam.startsWith('/')) {
    return nextParam;
  }

  try {
    const nextUrl = new URL(nextParam);
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}` || '/';
  } catch {
    return '/';
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = resolveNextPath(requestUrl.searchParams.get('next'));
  const origin = normalizeOrigin(requestUrl.origin);
  const redirectUrl = `${origin}${next}`;

  if (!code) {
    return NextResponse.redirect(redirectUrl);
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Supabase OAuth exchange failed:', error.message);
    return NextResponse.redirect(`${origin}/?authError=oauth_exchange_failed`);
  }

  return NextResponse.redirect(redirectUrl);
}
