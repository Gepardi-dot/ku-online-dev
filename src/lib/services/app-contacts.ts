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
    const code = typeof error.code === 'string' ? error.code : '';
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    const tableMissing = code === '42P01' || message.includes('relation') && message.includes('does not exist');
    if (!tableMissing) {
      console.error('Failed to load app contacts', error);
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

