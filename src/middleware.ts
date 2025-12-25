import { NextResponse, type NextRequest } from 'next/server';

import { refreshSupabaseSession } from '@/utils/supabase/edge-session';

export async function middleware(request: NextRequest) {
  try {
    // In dev, redirect invalid host 0.0.0.0 to localhost to keep OAuth callbacks valid
    if (process.env.NODE_ENV !== 'production') {
      const host = request.headers.get('host') || '';
      if (host.startsWith('0.0.0.0')) {
        const url = new URL(request.url.replace('://0.0.0.0', '://localhost'));
        return NextResponse.redirect(url);
      }
    }

    return await refreshSupabaseSession(request);
  } catch {
    // If there's an error, just continue with the request
    return;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
