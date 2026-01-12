import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

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

