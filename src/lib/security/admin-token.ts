import { timingSafeEqual } from 'node:crypto';

type RequestWithHeaders = {
  headers: Headers;
};

export function readAdminToken(request: RequestWithHeaders): string {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return (request.headers.get('x-admin-token') ?? '').trim();
}

export function timingSafeTokenEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isAdminTokenAuthorized(request: RequestWithHeaders, expectedToken: string | null | undefined): boolean {
  const expected = expectedToken?.trim() ?? '';
  if (!expected) {
    return false;
  }

  return timingSafeTokenEqual(readAdminToken(request), expected);
}
