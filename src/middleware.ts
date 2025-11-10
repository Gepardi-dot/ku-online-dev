import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Normalize invalid dev host 0.0.0.0 to localhost to avoid ERR_ADDRESS_INVALID
  if (url.hostname === '0.0.0.0') {
    url.hostname = 'localhost';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

