import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';

export type AppContactsSource = 'db' | 'env' | 'none';

export type AppContacts = {
  supportEmail: string | null;
  supportWhatsapp: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  source: AppContactsSource;
};

type AppSettingsRow = {
  support_email: string | null;
  support_whatsapp: string | null;
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

type SupabaseErrorMeta = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized || null;
}

function normalizeWhatsapp(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+').trim();
  if (!normalized) return null;
  if (normalized.startsWith('+')) return normalized;
  return `+${normalized}`;
}

function normalizeUserName(value: AppSettingsRow['updated_user']): string | null {
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
    details: typeof value.details === 'string' ? value.details : '',
    hint: typeof value.hint === 'string' ? value.hint : '',
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

export function normalizeAppContactsInput(input: {
  supportEmail?: string | null;
  supportWhatsapp?: string | null;
}): { supportEmail: string | null; supportWhatsapp: string | null } {
  return {
    supportEmail: normalizeEmail(input.supportEmail ?? null),
    supportWhatsapp: normalizeWhatsapp(input.supportWhatsapp ?? null),
  };
}

export function getFallbackAppContacts(): AppContacts {
  const env = getEnv();
  const supportEmail = normalizeEmail(env.NEXT_PUBLIC_PARTNERSHIPS_EMAIL ?? null);
  const supportWhatsapp = normalizeWhatsapp(env.NEXT_PUBLIC_PARTNERSHIPS_WHATSAPP ?? null);
  const source: AppContactsSource = supportEmail || supportWhatsapp ? 'env' : 'none';
  return {
    supportEmail,
    supportWhatsapp,
    updatedAt: null,
    updatedByName: null,
    source,
  };
}

export async function getAppContacts(): Promise<AppContacts> {
  const env = getEnv();
  const supabaseAdmin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select(
      `
      support_email,
      support_whatsapp,
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
    const meta = getSupabaseErrorMeta(error);
    if (!isExpectedSchemaFallbackError(meta)) {
      console.error('Failed to load app contacts', {
        code: meta.code || null,
        message: meta.message || null,
        details: meta.details || null,
        hint: meta.hint || null,
      });
    }
    return getFallbackAppContacts();
  }

  if (!data) {
    return getFallbackAppContacts();
  }

  const row = data as unknown as AppSettingsRow;
  const supportEmail = normalizeEmail(row.support_email);
  const supportWhatsapp = normalizeWhatsapp(row.support_whatsapp);
  if (!supportEmail && !supportWhatsapp) {
    return getFallbackAppContacts();
  }

  return {
    supportEmail,
    supportWhatsapp,
    updatedAt: row.updated_at ?? null,
    updatedByName: normalizeUserName(row.updated_user),
    source: 'db',
  };
}
