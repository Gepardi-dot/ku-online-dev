import 'server-only';

import { cookies } from 'next/headers';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';

export interface SellerProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  location: string | null;
  rating: number | string | null;
  total_ratings: number | null;
  created_at: string | null;
  bio: string | null;
  phone: string | null;
  is_verified: boolean | null;
}

let supabaseAdmin: ReturnType<typeof createSupabaseAdmin> | null = null;
let supabaseAdminUnavailable = false;

function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }
  if (supabaseAdminUnavailable) {
    return null;
  }

  try {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
    supabaseAdmin = createSupabaseAdmin(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch (error) {
    console.warn('Service role Supabase client unavailable', error);
    supabaseAdminUnavailable = true;
  }

  return supabaseAdmin;
}

export async function getSellerProfileById(id: string): Promise<SellerProfileRow | null> {
  if (!id) return null;

  const select =
    'id, full_name, avatar_url, location, rating, total_ratings, created_at, bio, phone, is_verified';

  const adminClient = getSupabaseAdmin();
  if (adminClient) {
    const { data, error } = await adminClient.from('users').select(select).eq('id', id).maybeSingle();
    if (error) {
      console.error('Failed to load seller profile (admin)', error);
      return null;
    }
    return (data as SellerProfileRow | null) ?? null;
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data, error } = await supabase.from('users').select(select).eq('id', id).maybeSingle();
  if (error) {
    console.error('Failed to load seller profile', error);
    return null;
  }
  return (data as SellerProfileRow | null) ?? null;
}

