import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const MOCK_PROFILE_COOKIE = "ku_mock_profiles";
const PROFILE_SELECT =
  "id, email, full_name, avatar_url, phone, location, bio, rating, total_ratings, created_at, updated_at, response_rate, is_verified";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export type UserProfileRecord = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  rating: number | null;
  totalRatings: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  responseRate: string | null;
  isVerified: boolean;
};

export type UpdateProfileInput = {
  id: string;
  email: string | null;
  fullName: string;
  location: string | null;
  phone: string | null;
  bio: string | null;
};

type MockProfilesMap = Record<
  string,
  {
    email: string | null;
    fullName: string;
    location: string | null;
    phone: string | null;
    bio: string | null;
    updatedAt: string;
  }
>;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function sanitizeMockProfiles(value: string | undefined): MockProfilesMap {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>).reduce<MockProfilesMap>(
        (acc, [key, entry]) => {
          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            const fullName = toStringOrNull(record.fullName) ?? "";
            if (!fullName) {
              return acc;
            }

            acc[key] = {
              email: toStringOrNull(record.email),
              fullName,
              location: toStringOrNull(record.location),
              phone: toStringOrNull(record.phone),
              bio: toStringOrNull(record.bio),
              updatedAt: toStringOrNull(record.updatedAt) ?? new Date().toISOString(),
            };
          }
          return acc;
        },
        {},
      );
    }
  } catch (error) {
    console.warn("Failed to parse mock profiles cookie", error);
  }

  return {};
}

async function resolveCookieStore(provided?: CookieStore): Promise<CookieStore> {
  if (provided) {
    return provided;
  }
  return await cookies();
}

async function resolveSupabaseClient(
  providedSupabase?: SupabaseClient,
  providedCookieStore?: CookieStore,
): Promise<SupabaseClient> {
  if (providedSupabase) {
    return providedSupabase;
  }
  const store = await resolveCookieStore(providedCookieStore);
  return createClient(store);
}

async function readMockProfiles(cookieStore?: CookieStore) {
  const store = await resolveCookieStore(cookieStore);
  const raw = store.get(MOCK_PROFILE_COOKIE)?.value;
  return {
    cookieStore: store,
    profiles: sanitizeMockProfiles(raw),
  };
}

function writeMockProfiles(cookieStore: CookieStore, profiles: MockProfilesMap) {
  cookieStore.set(MOCK_PROFILE_COOKIE, JSON.stringify(profiles), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function mapProfileRow(row: Record<string, unknown>): UserProfileRecord {
  return {
    id: toStringOrNull(row.id) ?? "",
    email: toStringOrNull(row.email),
    fullName: toStringOrNull(row.full_name),
    avatarUrl: toStringOrNull(row.avatar_url),
    phone: toStringOrNull(row.phone),
    location: toStringOrNull(row.location),
    bio: toStringOrNull(row.bio),
    rating: toNumber(row.rating),
    totalRatings: toNumber(row.total_ratings),
    createdAt: toStringOrNull(row.created_at),
    updatedAt: toStringOrNull(row.updated_at),
    responseRate: toStringOrNull(row.response_rate),
    isVerified: Boolean(row.is_verified),
  };
}

export async function getUserProfile(
  userId: string,
  options: { supabase?: SupabaseClient; cookieStore?: CookieStore } = {},
): Promise<UserProfileRecord | null> {
  if (!userId) {
    return null;
  }

  if (USE_MOCK_DATA) {
    const { cookieStore, profiles } = await readMockProfiles(options.cookieStore);
    const entry = profiles[userId];
    if (!entry) {
      return null;
    }

    return {
      id: userId,
      email: entry.email,
      fullName: entry.fullName,
      avatarUrl: null,
      phone: entry.phone,
      location: entry.location,
      bio: entry.bio,
      rating: null,
      totalRatings: null,
      createdAt: entry.updatedAt,
      updatedAt: entry.updatedAt,
      responseRate: null,
      isVerified: false,
    };
  }

  const supabase = await resolveSupabaseClient(options.supabase, options.cookieStore);
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load user profile", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapProfileRow(data as Record<string, unknown>);
}

export async function updateUserProfile(
  input: UpdateProfileInput,
  options: { supabase?: SupabaseClient; cookieStore?: CookieStore } = {},
): Promise<{ success: boolean; error?: unknown }> {
  if (!input.id) {
    return { success: false };
  }

  if (USE_MOCK_DATA) {
    const { cookieStore, profiles } = await readMockProfiles(options.cookieStore);
    profiles[input.id] = {
      email: input.email,
      fullName: input.fullName,
      location: input.location,
      phone: input.phone,
      bio: input.bio,
      updatedAt: new Date().toISOString(),
    };
    writeMockProfiles(cookieStore, profiles);
    return { success: true };
  }

  const supabase = await resolveSupabaseClient(options.supabase, options.cookieStore);

  const payload = {
    id: input.id,
    email: input.email,
    full_name: input.fullName,
    location: input.location,
    phone: input.phone,
    bio: input.bio,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase.from("users").upsert(payload, {
    onConflict: "id",
  });

  if (upsertError) {
    console.error("Failed to upsert user profile", upsertError);
    return { success: false, error: upsertError };
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      full_name: input.fullName,
      location: input.location,
      phone: input.phone,
    },
  });

  if (authError) {
    console.error("Failed to update auth metadata", authError);
    return { success: false, error: authError };
  }

  return { success: true };
}
