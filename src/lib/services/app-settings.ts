import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';

export type SponsorLiveStatsVisibility = {
  publicVisible: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  source: 'db' | 'default';
};

type AppSettingsVisibilityRow = {
  sponsor_live_stats_public: boolean | null;
  updated_at: string | null;
  updated_by: string | null;
  updated_user:
    | {
        full_name: string | null;
        name: string | null;
        email: string | null;
      }
    | {
        full_name: string | null;
        name: string | null;
        email: string | null;
      }[]
    | null;
};

function normalizeUpdatedByName(value: AppSettingsVisibilityRow['updated_user']): string | null {
  const candidate = Array.isArray(value) ? value[0] ?? null : value;
  if (!candidate) return null;
  return candidate.full_name?.trim() || candidate.name?.trim() || candidate.email?.trim() || null;
}

function getDefaultVisibility(): SponsorLiveStatsVisibility {
  return {
    publicVisible: false,
    updatedAt: null,
    updatedByName: null,
    source: 'default',
  };
}

export async function getSponsorLiveStatsVisibility(): Promise<SponsorLiveStatsVisibility> {
  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select(
      `
      sponsor_live_stats_public,
      updated_at,
      updated_by,
      updated_user:users!app_settings_updated_by_fkey (
        full_name,
        name,
        email
      )
    `,
    )
    .eq('id', true)
    .maybeSingle();

  if (error) {
    const code = typeof error.code === 'string' ? error.code : '';
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    const tableMissing = code === '42P01' || (message.includes('relation') && message.includes('does not exist'));
    const columnMissing = code === '42703' || (message.includes('column') && message.includes('does not exist'));

    if (!tableMissing && !columnMissing) {
      console.error('Failed to load sponsor live stats visibility', error);
    }

    return getDefaultVisibility();
  }

  if (!data) {
    return getDefaultVisibility();
  }

  const row = data as unknown as AppSettingsVisibilityRow;
  return {
    publicVisible: Boolean(row.sponsor_live_stats_public),
    updatedAt: row.updated_at ?? null,
    updatedByName: normalizeUpdatedByName(row.updated_user),
    source: 'db',
  };
}
