import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL } = getEnv();
const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function getServerCookieOptions(): CookieOptionsWithName {
  let secure = process.env.NODE_ENV === "production";

  if (NEXT_PUBLIC_SITE_URL) {
    try {
      secure = new URL(NEXT_PUBLIC_SITE_URL).protocol === "https:";
    } catch {
      // Fall back to NODE_ENV-derived default.
    }
  }

  return {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure,
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}

export const createClient = async (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: getServerCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
