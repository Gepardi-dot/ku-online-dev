import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';

export type SponsorLiveStatsVisibility = {
  publicVisible: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  source: 'db' | 'default';
};

type AppSettingsVisibilityRow = {
  sponsor_live_stats_public?: boolean | null;
  updated_at?: string | null;
  updated_by?: string | null;
  updated_user?:
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

type SupabaseErrorMeta = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

function normalizeUpdatedByName(value: AppSettingsVisibilityRow['updated_user']): string | null {
  const candidate = Array.isArray(value) ? value[0] ?? null : value;
  if (!candidate) return null;
  return candidate.full_name?.trim() || candidate.name?.trim() || candidate.email?.trim() || null;
}

function getSupabaseErrorMeta(error: unknown): SupabaseErrorMeta {
  if (typeof error === 'string') {
    return {
      code: '',
      message: error.toLowerCase(),
      details: '',
      hint: '',
    };
  }

  const value = (error ?? {}) as Record<string, unknown>;
  return {
    code: typeof value.code === 'string' ? value.code : '',
    message: typeof value.message === 'string' ? value.message.toLowerCase() : '',
    details: typeof value.details === 'string' ? value.details.toLowerCase() : '',
    hint: typeof value.hint === 'string' ? value.hint.toLowerCase() : '',
  };
}

function hasSupabaseErrorMeta(meta: SupabaseErrorMeta): boolean {
  return Boolean(meta.code || meta.message || meta.details || meta.hint);
}

function isExpectedSchemaFallbackError(meta: SupabaseErrorMeta): boolean {
  if (!hasSupabaseErrorMeta(meta)) {
    return true;
  }

  const tableMissing =
    meta.code === '42P01' ||
    meta.code === 'PGRST205' ||
    (meta.message.includes('relation') && meta.message.includes('does not exist')) ||
    (meta.message.includes('could not find') && meta.message.includes('table') && meta.message.includes('schema cache'));
  const columnMissing =
    meta.code === '42703' || meta.code === 'PGRST204' || (meta.message.includes('column') && meta.message.includes('does not exist'));
  const relationshipMissing =
    meta.code === 'PGRST200' ||
    (meta.message.includes('relationship') && meta.message.includes('schema cache')) ||
    (meta.message.includes('could not find') && meta.message.includes('relationship'));
  const detailsLower = meta.details.toLowerCase();
  const noRowsMaybeSingle =
    (meta.code === 'PGRST116' ||
      (meta.message.includes('json object requested') && meta.message.includes('multiple (or no) rows returned'))) &&
    (detailsLower.includes('0 rows') || detailsLower.includes('no rows'));
  return tableMissing || columnMissing || relationshipMissing || noRowsMaybeSingle;
}

function isIncompatibleSingletonIdFilterError(meta: SupabaseErrorMeta): boolean {
  const codeMatch = meta.code === '22P02' || meta.code === '42883';
  if (!codeMatch) return false;

  const combined = `${meta.message} ${meta.details} ${meta.hint}`;
  const looksLikeIdMismatch =
    combined.includes('invalid input syntax') ||
    combined.includes('operator does not exist') ||
    combined.includes('uuid') ||
    combined.includes('boolean');
  const referencesTrueLiteral = combined.includes('true');
  return looksLikeIdMismatch && referencesTrueLiteral;
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

  const selectWithUser = `
      sponsor_live_stats_public,
      updated_at,
      updated_by,
      updated_user:users!app_settings_updated_by_fkey (
        full_name,
        name,
        email
      )
    `;
  const selectWithoutUser = `
      sponsor_live_stats_public,
      updated_at,
      updated_by
    `;
  const selectMinimal = `sponsor_live_stats_public`;

  const attempts = [
    { select: selectWithUser, singletonByBooleanId: true },
    { select: selectWithoutUser, singletonByBooleanId: true },
    { select: selectMinimal, singletonByBooleanId: true },
    { select: selectWithUser, singletonByBooleanId: false },
    { select: selectWithoutUser, singletonByBooleanId: false },
    { select: selectMinimal, singletonByBooleanId: false },
  ] as const;

  let data: unknown = null;

  for (const attempt of attempts) {
    let query = supabaseAdmin.from('app_settings').select(attempt.select);
    if (attempt.singletonByBooleanId) {
      query = query.eq('id', true);
    } else {
      query = query.limit(1);
    }

    const result = await query.maybeSingle();
    if (!result.error) {
      data = result.data;
      break;
    }

    const meta = getSupabaseErrorMeta(result.error);
    const shouldRetry =
      isExpectedSchemaFallbackError(meta) || (attempt.singletonByBooleanId && isIncompatibleSingletonIdFilterError(meta));
    if (!shouldRetry) {
      return getDefaultVisibility();
    }
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
