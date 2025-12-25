import { type NextRequest, NextResponse } from 'next/server';

import { getPublicEnv } from '@/lib/env-public';

type SupabaseTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: unknown;
  [key: string]: unknown;
};

const COOKIE_CHUNK_SIZE = 3180;
const BASE64_PREFIX = 'base64-';
const SESSION_REFRESH_SAFETY_WINDOW_SECONDS = 60;

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function createChunks(key: string, value: string, chunkSize = COOKIE_CHUNK_SIZE) {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) {
    return [{ name: key, value }];
  }

  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, chunkSize);
    const lastEscapePos = encodedChunkHead.lastIndexOf('%');
    if (lastEscapePos > chunkSize - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }

    let valueHead = '';
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedChunkHead.at(-3) === '%' && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }

    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }

  return chunks.map((chunk, i) => ({ name: `${key}.${i}`, value: chunk }));
}

function getCookieValue(request: NextRequest, key: string): string | null {
  const direct = request.cookies.get(key)?.value;
  if (direct) return direct;

  const values: string[] = [];
  for (let i = 0; ; i++) {
    const chunk = request.cookies.get(`${key}.${i}`)?.value;
    if (!chunk) break;
    values.push(chunk);
  }
  return values.length ? values.join('') : null;
}

function getCookieChunkNames(request: NextRequest, key: string): string[] {
  const all = request.cookies.getAll();
  const prefix = `${key}.`;
  return all
    .map((c) => c.name)
    .filter((name) => name === key || name.startsWith(prefix));
}

function getAuthStorageKey(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname;
  return `sb-${hostname.split('.')[0]}-auth-token`;
}

function decodeSessionCookie(cookieValue: string): unknown | null {
  const raw = cookieValue.startsWith(BASE64_PREFIX)
    ? base64UrlDecode(cookieValue.slice(BASE64_PREFIX.length))
    : cookieValue;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function encodeSessionCookie(session: unknown): string {
  return `${BASE64_PREFIX}${base64UrlEncode(JSON.stringify(session))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function refreshToken(supabaseUrl: string, supabaseAnonKey: string, refreshToken: string) {
  const url = new URL('auth/v1/token', supabaseUrl);
  url.searchParams.set('grant_type', 'refresh_token');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status };
  }

  const data = (await res.json()) as SupabaseTokenResponse;
  return { ok: true as const, data };
}

export async function refreshSupabaseSession(request: NextRequest) {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  const authKey = getAuthStorageKey(NEXT_PUBLIC_SUPABASE_URL);

  const cookieValue = getCookieValue(request, authKey);
  if (!cookieValue) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const decoded = decodeSessionCookie(cookieValue);
  if (!isRecord(decoded)) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const refreshTokenValue = decoded.refresh_token;
  const expiresAtValue = decoded.expires_at;
  const expiresAt =
    typeof expiresAtValue === 'number'
      ? expiresAtValue
      : typeof expiresAtValue === 'string'
        ? Number(expiresAtValue)
        : NaN;

  if (typeof refreshTokenValue !== 'string' || !refreshTokenValue || !Number.isFinite(expiresAt)) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const now = Math.round(Date.now() / 1000);
  const secondsToExpiry = expiresAt - now;
  if (secondsToExpiry > SESSION_REFRESH_SAFETY_WINDOW_SECONDS) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const refreshed = await refreshToken(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    refreshTokenValue,
  );

  const response = NextResponse.next({ request: { headers: request.headers } });
  const cookieOptions = {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: false,
    secure: request.nextUrl.protocol === 'https:',
    maxAge: 400 * 24 * 60 * 60,
  };

  const existingNames = new Set(getCookieChunkNames(request, authKey));

  if (!refreshed.ok) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const nextSession = {
    expires_at: Math.round(Date.now() / 1000) + refreshed.data.expires_in,
    ...refreshed.data,
  };

  const encoded = encodeSessionCookie(nextSession);
  const chunks = createChunks(authKey, encoded);
  const nextNames = new Set(chunks.map((c) => c.name));

  for (const name of existingNames) {
    if (!nextNames.has(name)) {
      response.cookies.set(name, '', { ...cookieOptions, maxAge: 0 });
    }
  }

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, cookieOptions);
  }

  return response;
}
