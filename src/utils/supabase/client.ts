import { createBrowserClient, type CookieOptionsWithName } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env-public";

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL } = getPublicEnv();
const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function isHttpsUrl(value: string | null | undefined): boolean | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return null;
  }
}

function getCookieOptions(): CookieOptionsWithName {
  const secureFromWindow = typeof window !== "undefined" ? window.location.protocol === "https:" : null;
  const secureFromSiteUrl = isHttpsUrl(NEXT_PUBLIC_SITE_URL);

  return {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: secureFromWindow ?? secureFromSiteUrl ?? process.env.NODE_ENV === "production",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}

export const createClient = () => {
  return createBrowserClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: getCookieOptions(),
      isSingleton: true,
    },
  );
};
